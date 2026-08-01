# Application Insights + Log Analytics (cost-capped) per environment.

locals {
  law_name  = "law-elyse-${local.name_suffix}"
  appi_name = "appi-elyse-portfolio-${local.name_suffix}"

  availability_url = var.custom_domain != "" ? "https://${var.custom_domain}/" : "https://${azurerm_static_web_app.main.default_host_name}/"
}

resource "azurerm_log_analytics_workspace" "main" {
  name                = local.law_name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.tags
}

resource "azurerm_application_insights" "main" {
  name                = local.appi_name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"
  retention_in_days   = 30
  daily_data_cap_in_gb = 1
  # Email when nearing the daily cap (uses Azure subscription contacts / AI notifications).
  daily_data_cap_notifications_enabled = true
  sampling_percentage                  = 100
  tags                                 = local.tags
}

# Prod-only availability ping (1 geo, every 10 minutes).
resource "azurerm_application_insights_standard_web_test" "homepage" {
  count = var.environment == "prod" && var.custom_domain != "" ? 1 : 0

  name                    = "webtest-elyse-homepage-${local.name_suffix}"
  resource_group_name     = azurerm_resource_group.main.name
  location                = azurerm_resource_group.main.location
  application_insights_id = azurerm_application_insights.main.id
  geo_locations           = ["us-va-ash-azr"]
  frequency               = 600
  timeout                 = 30
  enabled                 = true
  retry_enabled           = true
  description             = "Homepage availability for ${var.custom_domain}"
  tags                    = local.tags

  request {
    url                              = local.availability_url
    http_verb                        = "GET"
    parse_dependent_requests_enabled = false
    follow_redirects_enabled         = true
  }

  validation_rules {
    expected_status_code = 200
    ssl_check_enabled    = true
  }
}

resource "azurerm_monitor_action_group" "alerts" {
  count = var.alert_email != "" ? 1 : 0

  name                = "ag-elyse-portfolio-${local.name_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "elyse${local.name_suffix}"
  tags                = local.tags

  email_receiver {
    name                    = "primary"
    email_address           = var.alert_email
    use_common_alert_schema = true
  }
}

resource "azurerm_monitor_metric_alert" "failed_requests" {
  count = var.alert_email != "" ? 1 : 0

  name                = "alert-elyse-failed-requests-${local.name_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_application_insights.main.id]
  description         = "Failed requests on ${local.appi_name}"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  tags                = local.tags

  criteria {
    metric_namespace = "microsoft.insights/components"
    metric_name      = "requests/failed"
    aggregation      = "Count"
    operator         = "GreaterThan"
    threshold        = 0
  }

  action {
    action_group_id = azurerm_monitor_action_group.alerts[0].id
  }
}

resource "azurerm_monitor_metric_alert" "availability" {
  count = var.alert_email != "" && var.environment == "prod" && var.custom_domain != "" ? 1 : 0

  name                = "alert-elyse-availability-${local.name_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_application_insights.main.id]
  description         = "Availability test failed for ${var.custom_domain}"
  severity            = 1
  frequency           = "PT5M"
  window_size         = "PT15M"
  tags                = local.tags

  criteria {
    metric_namespace = "microsoft.insights/components"
    metric_name      = "availabilityResults/availabilityPercentage"
    aggregation      = "Average"
    operator         = "LessThan"
    threshold        = 100
  }

  action {
    action_group_id = azurerm_monitor_action_group.alerts[0].id
  }
}
