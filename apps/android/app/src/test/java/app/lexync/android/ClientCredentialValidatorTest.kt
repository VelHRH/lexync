package app.lexync.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ClientCredentialValidatorTest {
    @Test
    fun acceptsAHostedPublishableKey() {
        val key = "sb_publishable_example"

        assertEquals(key, ClientCredentialValidator.requirePublishableKey(key))
    }

    @Test
    fun rejectsASecretKey() {
        assertThrows(IllegalArgumentException::class.java) {
            ClientCredentialValidator.requirePublishableKey("sb_secret_example")
        }
    }

    @Test
    fun rejectsALegacyServiceRoleJwt() {
        val key = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature"

        assertThrows(IllegalArgumentException::class.java) {
            ClientCredentialValidator.requirePublishableKey(key)
        }
    }
}
