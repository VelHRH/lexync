import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Group {
            switch model.screen {
            case .library:
                LibraryView()
            case .signIn:
                SignInView()
            }
        }
    }
}

private struct SignInView: View {
    @EnvironmentObject private var model: AppModel
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    TextField("Email", text: $model.email)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                    Button("Sign In") {
                        Task {
                            await model.signIn(password: password)
                        }
                    }
                    .disabled(model.email.isEmpty || password.isEmpty)
                }

                if let errorMessage = model.errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Lexync")
        }
    }
}

private struct LibraryView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        NavigationStack {
            List {
                Section("Account") {
                    Text(model.email)
                    Text(model.synchronizationState.message)
                        .foregroundStyle(.secondary)
                    Text(entryCountLabel)
                        .foregroundStyle(.secondary)
                }

                ForEach(model.studyPairs) { studyPair in
                    Section(studyPair.displayName) {
                        ForEach(studyPair.vocabularyEntries) { vocabularyEntry in
                            NavigationLink {
                                VocabularyEntryView(vocabularyEntry: vocabularyEntry)
                            } label: {
                                VStack(alignment: .leading) {
                                    Text(vocabularyEntry.expression)
                                    if vocabularyEntry.suspended {
                                        Text("Suspended")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .accessibilityLabel("Open Vocabulary Entry \(vocabularyEntry.expression)")
                        }
                    }
                }
            }
            .navigationTitle("Library")
            .toolbar {
                Button("Synchronize") {
                    Task {
                        await model.synchronize()
                    }
                }
                .disabled(!model.canSynchronize)
            }
        }
    }

    private var entryCountLabel: String {
        model.vocabularyEntryCount == 1
            ? "1 Vocabulary Entry"
            : "\(model.vocabularyEntryCount) Vocabulary Entries"
    }
}

private struct VocabularyEntryView: View {
    let vocabularyEntry: VocabularyEntry

    var body: some View {
        List {
            ForEach(Array(vocabularyEntry.senses.enumerated()), id: \.element.id) { index, sense in
                Section("Sense \(index + 1)") {
                    ForEach(sense.translations) { translation in
                        Label(translation.text, systemImage: "character.book.closed")
                    }
                    ForEach(sense.examples) { example in
                        Label(example.text, systemImage: "text.quote")
                    }
                }
            }
        }
        .navigationTitle(vocabularyEntry.expression)
    }
}
