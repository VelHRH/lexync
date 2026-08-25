import XCTest
@testable import Lexync

final class LibraryStoreTests: XCTestCase {
    override func setUpWithError() throws {
        try? LibraryStore.reset()
    }

    func testReplacingASnapshotIsAtomicAndIdempotent() throws {
        let store = try LibraryStore()
        let first = snapshot(expression: "caminar", translation: "to walk")
        let second = snapshot(expression: "andar", translation: "to go on foot")

        try store.replace(with: first, email: "learner@example.com")
        try store.replace(with: second, email: "learner@example.com")
        try store.replace(with: second, email: "learner@example.com")

        let library = try XCTUnwrap(store.load())
        XCTAssertEqual(library.email, "learner@example.com")
        XCTAssertEqual(library.studyPairs.count, 1)
        XCTAssertEqual(library.studyPairs[0].vocabularyEntries.count, 1)
        XCTAssertEqual(library.studyPairs[0].vocabularyEntries[0].expression, "andar")
        XCTAssertEqual(library.studyPairs[0].vocabularyEntries[0].senses[0].translations[0].text, "to go on foot")
    }

    private func snapshot(expression: String, translation: String) -> AccountVocabularySnapshot {
        AccountVocabularySnapshot(
            schemaVersion: 1,
            learnerId: UUID(uuidString: "88888888-8888-8888-8888-888888888888")!,
            studyPairs: [
                StudyPair(
                    id: UUID(uuidString: "11111111-1111-1111-1111-111111111111")!,
                    targetLanguageTag: "es",
                    referenceLanguageTag: "en",
                    isPrimary: true,
                    vocabularyEntries: [
                        VocabularyEntry(
                            id: UUID(uuidString: "22222222-2222-2222-2222-222222222222")!,
                            expression: expression,
                            suspended: false,
                            senses: [
                                Sense(
                                    id: UUID(uuidString: "33333333-3333-3333-3333-333333333333")!,
                                    translations: [
                                        Translation(
                                            id: UUID(uuidString: "44444444-4444-4444-4444-444444444444")!,
                                            text: translation
                                        ),
                                    ],
                                    examples: [
                                        Example(
                                            id: UUID(uuidString: "55555555-5555-5555-5555-555555555555")!,
                                            text: "Camino al trabajo cada mañana."
                                        ),
                                    ]
                                ),
                            ]
                        ),
                    ]
                ),
            ]
        )
    }
}
