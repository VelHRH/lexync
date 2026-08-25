import XCTest
import Supabase

final class LexyncUITests: XCTestCase {
    private var email: String {
        get throws {
            try XCTUnwrap(ProcessInfo.processInfo.environment["LEXYNC_TEST_EMAIL"])
        }
    }

    private var password: String {
        get throws {
            try XCTUnwrap(ProcessInfo.processInfo.environment["LEXYNC_TEST_PASSWORD"])
        }
    }

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testSignInSynchronizesTheCompleteVocabularyGraph() throws {
        let app = launch(resetLocalData: true)

        try signIn(app)

        XCTAssertTrue(app.staticTexts[try email].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Synchronization complete"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Spanish · English"].exists)

        app.buttons["Open Vocabulary Entry caminar"].tap()

        XCTAssertTrue(app.staticTexts["to walk"].exists)
        XCTAssertTrue(app.staticTexts["to travel on foot"].exists)
        XCTAssertTrue(app.staticTexts["Camino al trabajo cada mañana."].exists)
    }

    func testSynchronizedVocabularySurvivesOfflineRelaunch() throws {
        var app = launch(resetLocalData: true)

        try signIn(app)
        XCTAssertTrue(app.buttons["Open Vocabulary Entry caminar"].waitForExistence(timeout: 15))
        app.terminate()

        app = launch(disableNetwork: true)

        XCTAssertTrue(app.buttons["Open Vocabulary Entry caminar"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Offline library"].exists)
    }

    func testLaterSnapshotReplacesRemovedVocabularyWithoutDuplicates() async throws {
        let app = launch(resetLocalData: true)

        try signIn(app)
        XCTAssertTrue(app.staticTexts["1 Vocabulary Entry"].waitForExistence(timeout: 15))

        let client = try await testClient()
        let studyPairs: [StudyPairId] = try await client
            .from("study_pairs")
            .select("id")
            .limit(1)
            .execute()
            .value
        let studyPair = try XCTUnwrap(studyPairs.first)
        let expression = "snapshot-\(UUID().uuidString.lowercased())"
        let capture: CaptureResult = try await client
            .rpc(
                "capture_manual_entry",
                params: CaptureParameters(
                    example: nil,
                    expression: expression,
                    studyPairId: studyPair.id,
                    translation: "snapshot test"
                )
            )
            .execute()
            .value

        app.buttons["Synchronize"].tap()
        XCTAssertTrue(app.buttons["Open Vocabulary Entry \(expression)"].waitForExistence(timeout: 15))

        try await client
            .from("vocabulary_entries")
            .delete()
            .eq("id", value: capture.vocabularyEntryId)
            .execute()

        app.buttons["Synchronize"].tap()
        XCTAssertTrue(app.staticTexts["Synchronization complete"].waitForExistence(timeout: 15))

        XCTAssertTrue(app.buttons["Open Vocabulary Entry \(expression)"].waitForNonExistence(timeout: 15))
        XCTAssertEqual(app.buttons.matching(identifier: "Open Vocabulary Entry caminar").count, 1)
        XCTAssertTrue(app.staticTexts["1 Vocabulary Entry"].exists)
    }

    private func launch(resetLocalData: Bool = false, disableNetwork: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        if resetLocalData {
            app.launchArguments.append("--reset-local-data")
        }
        if disableNetwork {
            app.launchArguments.append("--disable-network")
        }
        for key in ["LEXYNC_SUPABASE_URL", "LEXYNC_SUPABASE_PUBLISHABLE_KEY"] {
            app.launchEnvironment[key] = ProcessInfo.processInfo.environment[key]
        }
        app.launch()
        return app
    }

    private func signIn(_ app: XCUIApplication) throws {
        let emailField = app.textFields["Email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 10))
        emailField.tap()
        emailField.typeText(try email)

        let passwordField = app.secureTextFields["Password"]
        passwordField.tap()
        passwordField.typeText(try password)
        app.buttons["Sign In"].tap()
    }

    private func testClient() async throws -> SupabaseClient {
        let environment = ProcessInfo.processInfo.environment
        let urlValue = try XCTUnwrap(environment["LEXYNC_SUPABASE_URL"])
        let url = try XCTUnwrap(URL(string: urlValue))
        let key = try XCTUnwrap(environment["LEXYNC_SUPABASE_PUBLISHABLE_KEY"])
        let client = SupabaseClient(supabaseURL: url, supabaseKey: key)
        _ = try await client.auth.signIn(email: email, password: password)
        return client
    }
}

private struct StudyPairId: Decodable {
    let id: UUID
}

private struct CaptureParameters: Encodable {
    let example: String?
    let expression: String
    let studyPairId: UUID
    let translation: String

    enum CodingKeys: String, CodingKey {
        case example = "p_example"
        case expression = "p_expression"
        case studyPairId = "p_study_pair_id"
        case translation = "p_translation"
    }
}

private struct CaptureResult: Decodable {
    let vocabularyEntryId: UUID
}
