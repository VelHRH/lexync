import Combine
import Foundation
import Supabase

@MainActor
final class AppModel: ObservableObject {
    enum Screen: Equatable {
        case library
        case signIn
    }

    enum SynchronizationState: Equatable {
        case complete
        case failed(String)
        case idle
        case offline
        case synchronizing

        var message: String {
            switch self {
            case .complete:
                "Synchronization complete"
            case let .failed(message):
                message
            case .idle:
                "Ready to synchronize"
            case .offline:
                "Offline library"
            case .synchronizing:
                "Synchronizing"
            }
        }
    }

    @Published var email = ""
    @Published var errorMessage: String?
    @Published private(set) var screen: Screen = .signIn
    @Published private(set) var studyPairs: [StudyPair] = []
    @Published private(set) var synchronizationState: SynchronizationState = .idle

    private let client: SupabaseClient?
    private let configurationError: String?
    private let disableNetwork: Bool
    private let resetLocalData: Bool
    private let store: LibraryStore?
    private let storeError: String?

    init(arguments: [String] = ProcessInfo.processInfo.arguments) {
        disableNetwork = arguments.contains("--disable-network")
        resetLocalData = arguments.contains("--reset-local-data")

        if resetLocalData {
            try? LibraryStore.reset()
        }

        do {
            store = try LibraryStore()
            storeError = nil
        } catch {
            store = nil
            storeError = error.localizedDescription
        }

        do {
            client = try AppConfiguration.supabaseClient(disableNetwork: disableNetwork)
            configurationError = nil
        } catch {
            client = nil
            configurationError = error.localizedDescription
        }

        loadStoredLibrary()

        if resetLocalData {
            screen = .signIn
        }
    }

    var vocabularyEntryCount: Int {
        studyPairs.reduce(0) { $0 + $1.vocabularyEntries.count }
    }

    var canSynchronize: Bool {
        client != nil && !disableNetwork && synchronizationState != .synchronizing
    }

    func start() async {
        guard !resetLocalData, let client else {
            if screen == .signIn {
                errorMessage = configurationError
            }
            return
        }

        do {
            let session = try await client.auth.session
            email = session.user.email ?? email
            screen = .library
            await synchronize()
        } catch {
            if studyPairs.isEmpty {
                screen = .signIn
            } else {
                synchronizationState = .offline
            }
        }
    }

    func signIn(password: String) async {
        guard let client else {
            errorMessage = configurationError
            return
        }
        guard !disableNetwork else {
            errorMessage = "Connect to the internet to sign in."
            return
        }

        errorMessage = nil
        synchronizationState = .synchronizing

        do {
            let session = try await client.auth.signIn(email: email, password: password)
            email = session.user.email ?? email
            screen = .library
            await synchronize()
        } catch {
            synchronizationState = .idle
            errorMessage = error.localizedDescription
        }
    }

    func synchronize() async {
        guard let client else {
            synchronizationState = .offline
            return
        }
        guard let store else {
            synchronizationState = .failed(storeError ?? "The offline library is unavailable.")
            return
        }

        synchronizationState = .synchronizing
        errorMessage = nil

        do {
            let snapshot: AccountVocabularySnapshot = try await client
                .rpc("account_vocabulary_snapshot")
                .execute()
                .value
            try store.replace(with: snapshot, email: email)
            loadStoredLibrary()
            screen = .library
            synchronizationState = .complete
        } catch {
            loadStoredLibrary()
            synchronizationState = studyPairs.isEmpty ? .failed(error.localizedDescription) : .offline
        }
    }

    private func loadStoredLibrary() {
        guard let library = try? store?.load() else {
            return
        }
        email = library.email
        studyPairs = library.studyPairs
        screen = .library
    }
}
