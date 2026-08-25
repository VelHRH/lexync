import Foundation

struct AccountVocabularySnapshot: Codable, Equatable {
    let schemaVersion: Int
    let learnerId: UUID
    let studyPairs: [StudyPair]
}

struct StudyPair: Codable, Equatable, Identifiable {
    let id: UUID
    let targetLanguageTag: String
    let referenceLanguageTag: String
    let isPrimary: Bool
    let vocabularyEntries: [VocabularyEntry]

    var displayName: String {
        "\(targetLanguageTag.languageName) · \(referenceLanguageTag.languageName)"
    }
}

struct VocabularyEntry: Codable, Equatable, Identifiable {
    let id: UUID
    let expression: String
    let suspended: Bool
    let senses: [Sense]
}

struct Sense: Codable, Equatable, Identifiable {
    let id: UUID
    let translations: [Translation]
    let examples: [Example]
}

struct Translation: Codable, Equatable, Identifiable {
    let id: UUID
    let text: String
}

struct Example: Codable, Equatable, Identifiable {
    let id: UUID
    let text: String
}

private extension String {
    var languageName: String {
        let languageCode = split(separator: "-").first.map(String.init) ?? self
        return Locale(identifier: "en").localizedString(forLanguageCode: languageCode)?.capitalized ?? self
    }
}
