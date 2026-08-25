import Foundation
import GRDB

final class LibraryStore: @unchecked Sendable {
    private let database: DatabaseQueue

    init() throws {
        let directory = try Self.applicationSupportDirectory()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var configuration = Configuration()
        configuration.foreignKeysEnabled = true
        database = try DatabaseQueue(
            path: directory.appendingPathComponent("library.sqlite").path,
            configuration: configuration
        )
        try Self.migrator.migrate(database)
    }

    static func reset() throws {
        try FileManager.default.removeItem(at: applicationSupportDirectory())
    }

    func replace(with snapshot: AccountVocabularySnapshot, email: String) throws {
        guard snapshot.schemaVersion == 1 else {
            throw LibraryStoreError.unsupportedSnapshotVersion
        }

        try database.write { database in
            try StudyPairRow.deleteAll(database)
            try AccountRow.deleteAll(database)

            for studyPair in snapshot.studyPairs {
                try StudyPairRow(studyPair).insert(database)
                for vocabularyEntry in studyPair.vocabularyEntries {
                    try VocabularyEntryRow(vocabularyEntry, studyPairId: studyPair.id).insert(database)
                    for sense in vocabularyEntry.senses {
                        try SenseRow(sense, vocabularyEntryId: vocabularyEntry.id).insert(database)
                        for translation in sense.translations {
                            try TranslationRow(translation, senseId: sense.id).insert(database)
                        }
                        for example in sense.examples {
                            try ExampleRow(example, senseId: sense.id).insert(database)
                        }
                    }
                }
            }

            try AccountRow(
                id: 1,
                learnerId: snapshot.learnerId.uuidString,
                email: email,
                synchronizedAt: Date()
            ).insert(database)
        }
    }

    func load() throws -> StoredLibrary? {
        try database.read { database in
            guard let account = try AccountRow.fetchOne(database, key: 1) else {
                return nil
            }

            let studyPairRows = try StudyPairRow.fetchAll(database)
            let entryRows = try VocabularyEntryRow.fetchAll(database)
            let senseRows = try SenseRow.fetchAll(database)
            let translationRows = try TranslationRow.fetchAll(database)
            let exampleRows = try ExampleRow.fetchAll(database)
            let translations = Dictionary(grouping: translationRows, by: \.senseId)
            let examples = Dictionary(grouping: exampleRows, by: \.senseId)
            let senses = Dictionary(grouping: senseRows, by: \.vocabularyEntryId)
            let entries = Dictionary(grouping: entryRows, by: \.studyPairId)

            let studyPairs = try studyPairRows.map { studyPair in
                StudyPair(
                    id: try Self.uuid(studyPair.id),
                    targetLanguageTag: studyPair.targetLanguageTag,
                    referenceLanguageTag: studyPair.referenceLanguageTag,
                    isPrimary: studyPair.isPrimary,
                    vocabularyEntries: try (entries[studyPair.id] ?? []).map { entry in
                        VocabularyEntry(
                            id: try Self.uuid(entry.id),
                            expression: entry.expression,
                            suspended: entry.suspended,
                            senses: try (senses[entry.id] ?? []).map { sense in
                                Sense(
                                    id: try Self.uuid(sense.id),
                                    translations: try (translations[sense.id] ?? []).map {
                                        Translation(id: try Self.uuid($0.id), text: $0.text)
                                    },
                                    examples: try (examples[sense.id] ?? []).map {
                                        Example(id: try Self.uuid($0.id), text: $0.text)
                                    }
                                )
                            }
                        )
                    }
                )
            }

            return StoredLibrary(email: account.email, studyPairs: studyPairs)
        }
    }

    private static func applicationSupportDirectory() throws -> URL {
        try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ).appendingPathComponent("Lexync", isDirectory: true)
    }

    private static func uuid(_ value: String) throws -> UUID {
        guard let id = UUID(uuidString: value) else {
            throw LibraryStoreError.invalidLocalIdentifier
        }
        return id
    }

    private static var migrator: DatabaseMigrator {
        var migrator = DatabaseMigrator()
        migrator.registerMigration("createLibrary") { database in
            try database.create(table: AccountRow.databaseTableName) { table in
                table.column("id", .integer).primaryKey()
                table.column("learnerId", .text).notNull()
                table.column("email", .text).notNull()
                table.column("synchronizedAt", .datetime).notNull()
            }
            try database.create(table: StudyPairRow.databaseTableName) { table in
                table.column("id", .text).primaryKey()
                table.column("targetLanguageTag", .text).notNull()
                table.column("referenceLanguageTag", .text).notNull()
                table.column("isPrimary", .boolean).notNull()
            }
            try database.create(table: VocabularyEntryRow.databaseTableName) { table in
                table.column("id", .text).primaryKey()
                table.column("studyPairId", .text).notNull().references(StudyPairRow.databaseTableName, onDelete: .cascade)
                table.column("expression", .text).notNull()
                table.column("suspended", .boolean).notNull()
            }
            try database.create(table: SenseRow.databaseTableName) { table in
                table.column("id", .text).primaryKey()
                table.column("vocabularyEntryId", .text).notNull().references(VocabularyEntryRow.databaseTableName, onDelete: .cascade)
            }
            try database.create(table: TranslationRow.databaseTableName) { table in
                table.column("id", .text).primaryKey()
                table.column("senseId", .text).notNull().references(SenseRow.databaseTableName, onDelete: .cascade)
                table.column("text", .text).notNull()
            }
            try database.create(table: ExampleRow.databaseTableName) { table in
                table.column("id", .text).primaryKey()
                table.column("senseId", .text).notNull().references(SenseRow.databaseTableName, onDelete: .cascade)
                table.column("text", .text).notNull()
            }
        }
        return migrator
    }
}

struct StoredLibrary {
    let email: String
    let studyPairs: [StudyPair]
}

enum LibraryStoreError: LocalizedError {
    case invalidLocalIdentifier
    case unsupportedSnapshotVersion

    var errorDescription: String? {
        switch self {
        case .invalidLocalIdentifier:
            "The offline library contains an invalid identifier."
        case .unsupportedSnapshotVersion:
            "This version of Lexync cannot read the synchronized library."
        }
    }
}

private struct AccountRow: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "account"

    let id: Int
    let learnerId: String
    let email: String
    let synchronizedAt: Date
}

private struct StudyPairRow: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "studyPair"

    let id: String
    let targetLanguageTag: String
    let referenceLanguageTag: String
    let isPrimary: Bool

    init(_ studyPair: StudyPair) {
        id = studyPair.id.uuidString
        targetLanguageTag = studyPair.targetLanguageTag
        referenceLanguageTag = studyPair.referenceLanguageTag
        isPrimary = studyPair.isPrimary
    }
}

private struct VocabularyEntryRow: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "vocabularyEntry"

    let id: String
    let studyPairId: String
    let expression: String
    let suspended: Bool

    init(_ vocabularyEntry: VocabularyEntry, studyPairId: UUID) {
        id = vocabularyEntry.id.uuidString
        self.studyPairId = studyPairId.uuidString
        expression = vocabularyEntry.expression
        suspended = vocabularyEntry.suspended
    }
}

private struct SenseRow: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "sense"

    let id: String
    let vocabularyEntryId: String

    init(_ sense: Sense, vocabularyEntryId: UUID) {
        id = sense.id.uuidString
        self.vocabularyEntryId = vocabularyEntryId.uuidString
    }
}

private struct TranslationRow: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "translation"

    let id: String
    let senseId: String
    let text: String

    init(_ translation: Translation, senseId: UUID) {
        id = translation.id.uuidString
        self.senseId = senseId.uuidString
        text = translation.text
    }
}

private struct ExampleRow: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "example"

    let id: String
    let senseId: String
    let text: String

    init(_ example: Example, senseId: UUID) {
        id = example.id.uuidString
        self.senseId = senseId.uuidString
        text = example.text
    }
}
