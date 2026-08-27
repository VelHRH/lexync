package app.lexync.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import java.util.Locale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val store = LibraryStore(LexyncDatabase.create(applicationContext))
        val testControlsEnabled = BuildConfig.DEBUG
        val viewModel = ViewModelProvider(this, LibraryViewModel.factory(
            store,
            testControlsEnabled && intent.getBooleanExtra(DISABLE_NETWORK, false),
            testControlsEnabled && intent.getBooleanExtra(RESET_LOCAL_DATA, false),
        ))[LibraryViewModel::class.java]
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    LibraryApp(viewModel)
                }
            }
        }
    }

    companion object {
        const val RESET_LOCAL_DATA = "resetLocalData"
        const val DISABLE_NETWORK = "disableNetwork"
    }
}

data class LibraryUiState(
    val library: StoredLibrary? = null,
    val status: String = "",
    val busy: Boolean = false,
    val error: String? = null,
)

class LibraryViewModel(
    private val store: LibraryStore,
    private val networkDisabled: Boolean,
    resetLocalData: Boolean,
) : ViewModel() {
    private val mutableState = MutableStateFlow(LibraryUiState())
    val state: StateFlow<LibraryUiState> = mutableState.asStateFlow()
    private var repository: LibraryRepository? = null

    init {
        viewModelScope.launch {
            if (resetLocalData) store.clear()
            val library = store.load()
            mutableState.value = LibraryUiState(library, if (networkDisabled && library != null) "Offline library" else "")
        }
    }

    fun signIn(email: String, password: String) {
        synchronize(email, password)
    }

    fun synchronize() {
        val email = mutableState.value.library?.email ?: return
        synchronize(email, null)
    }

    private fun synchronize(email: String, password: String?) {
        viewModelScope.launch {
            if (networkDisabled) {
                mutableState.value = mutableState.value.copy(status = "Offline library")
                return@launch
            }
            mutableState.value = mutableState.value.copy(busy = true, error = null)
            try {
                val activeRepository = repository ?: LibraryRepository.create().also { repository = it }
                if (password != null) activeRepository.signIn(email, password)
                val snapshot = activeRepository.snapshot()
                store.replace(snapshot, email)
                mutableState.value = LibraryUiState(store.load(), "Synchronization complete")
            } catch (exception: Exception) {
                val library = store.load()
                mutableState.value = LibraryUiState(library, if (library != null) "Offline library" else "", error = exception.message ?: "Synchronization failed")
            }
        }
    }

    override fun onCleared() {
        repository?.let { activeRepository ->
            CoroutineScope(SupervisorJob() + Dispatchers.IO).launch { activeRepository.close() }
        }
    }

    companion object {
        fun factory(store: LibraryStore, networkDisabled: Boolean, resetLocalData: Boolean): ViewModelProvider.Factory {
            return object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return LibraryViewModel(store, networkDisabled, resetLocalData) as T
                }
            }
        }
    }
}

@Composable
fun LibraryApp(viewModel: LibraryViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    if (state.library == null) {
        SignInScreen(state, viewModel::signIn)
    } else {
        LibraryScreen(state, viewModel::synchronize)
    }
}

@Composable
private fun SignInScreen(state: LibraryUiState, signIn: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Lexync", style = MaterialTheme.typography.headlineLarge)
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(email, { email = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Email") }, singleLine = true)
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(password, { password = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Password") }, singleLine = true, visualTransformation = PasswordVisualTransformation())
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 12.dp)) }
        Button({ signIn(email, password) }, enabled = !state.busy, modifier = Modifier.fillMaxWidth().padding(top = 20.dp)) {
            Text("Sign In")
        }
    }
}

@Composable
private fun LibraryScreen(state: LibraryUiState, synchronize: () -> Unit) {
    val library = requireNotNull(state.library)
    var selected by remember { mutableStateOf<VocabularyEntry?>(null) }
    selected?.let { entry ->
        EntryScreen(entry) { selected = null }
        return
    }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("Vocabulary", style = MaterialTheme.typography.headlineLarge)
            Text(library.email, style = MaterialTheme.typography.bodyMedium)
            if (state.status.isNotEmpty()) Text(state.status, color = MaterialTheme.colorScheme.primary)
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(synchronize, enabled = !state.busy, modifier = Modifier.padding(top = 12.dp)) { Text("Synchronize") }
        }
        library.studyPairs.forEach { pair ->
            item {
                Text("${languageName(pair.targetLanguageTag)} · ${languageName(pair.referenceLanguageTag)}", style = MaterialTheme.typography.titleLarge)
                val count = pair.vocabularyEntries.size
                Text("$count Vocabulary ${if (count == 1) "Entry" else "Entries"}")
            }
            items(pair.vocabularyEntries, key = { it.id }) { entry ->
                Card(
                    modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Open Vocabulary Entry ${entry.expression}" }.clickable { selected = entry },
                ) {
                    Row(Modifier.padding(18.dp)) { Text(entry.expression, style = MaterialTheme.typography.titleMedium) }
                }
            }
        }
    }
}

@Composable
private fun EntryScreen(entry: VocabularyEntry, back: () -> Unit) {
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Button(back) { Text("Back") }
            Text(entry.expression, style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(top = 18.dp))
        }
        entry.senses.forEachIndexed { index, sense ->
            item { Text("Sense ${index + 1}", style = MaterialTheme.typography.titleMedium) }
            items(sense.translations) { Text(it.text) }
            items(sense.examples) { Text(it.text, style = MaterialTheme.typography.bodyMedium) }
        }
    }
}

private fun languageName(tag: String): String = Locale.forLanguageTag(tag).getDisplayLanguage(Locale.ENGLISH)
