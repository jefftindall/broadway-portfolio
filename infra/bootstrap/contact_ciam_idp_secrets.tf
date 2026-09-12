# CONTACT-IDP-* placeholders for CIAM social federation (ACCOUNT-P1-010).
# Operators paste vendor console credentials via `az keyvault secret set`.
# Terraform keeps names stable; values are never committed.

resource "azurerm_key_vault_secret" "contact_idp_google_client_id" {
  name         = "CONTACT-IDP-GOOGLE-CLIENT-ID"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

resource "azurerm_key_vault_secret" "contact_idp_google_client_secret" {
  name         = "CONTACT-IDP-GOOGLE-CLIENT-SECRET"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

resource "azurerm_key_vault_secret" "contact_idp_apple_services_id" {
  name         = "CONTACT-IDP-APPLE-SERVICES-ID"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

resource "azurerm_key_vault_secret" "contact_idp_apple_team_id" {
  name         = "CONTACT-IDP-APPLE-TEAM-ID"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

resource "azurerm_key_vault_secret" "contact_idp_apple_key_id" {
  name         = "CONTACT-IDP-APPLE-KEY-ID"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

resource "azurerm_key_vault_secret" "contact_idp_apple_private_key" {
  name         = "CONTACT-IDP-APPLE-PRIVATE-KEY"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

resource "azurerm_key_vault_secret" "contact_idp_msa_client_id" {
  name         = "CONTACT-IDP-MSA-CLIENT-ID"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

resource "azurerm_key_vault_secret" "contact_idp_msa_client_secret" {
  name         = "CONTACT-IDP-MSA-CLIENT-SECRET"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}
