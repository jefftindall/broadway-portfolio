# Application Insights + Log Analytics (cost-capped) per environment.
# Ops contacts come from shared kv-elyse-shared ALERT-* (OPS-P1-001 / OPS-P1-002).
# Never pass emails/phones via Terraform variables.

locals {
  law_name  = "law-elyse-${local.name_suffix}"
  appi_name = "appi-elyse-portfolio-${local.name_suffix}"

  availability_url = var.custom_domain != "" ? "https://${var.custom_domain}/" : "https://${azurerm_static_web_app.main.default_host_name}/"
  materials_base   = trimsuffix(local.availability_url, "/")
  resume_pdf_url   = "${local.materials_base}/downloads/elyse-tindall-resume.pdf"
  headshot_url     = "${local.materials_base}/downloads/elyse-tindall-headshot-theatrical.jpg"

  # Prod synthetics (homepage + materials) when custom domain is set.
  prod_availability_enabled = var.environment == "prod" && var.custom_domain != ""

  # Longest-first dial codes Azure Monitor SMS/voice supports (see action-groups docs).
  alert_e164_dial_pattern = "^(971|886|852|420|372|358|353|352|351|972|91|86|82|81|65|64|61|60|56|55|52|49|47|45|44|43|41|40|39|34|33|32|31|27|7|1)([0-9]+)$"

  alert_email_raw = trimspace(data.azurerm_key_vault_secret.alert_email.value)
  alert_sms_raw   = trimspace(data.azurerm_key_vault_secret.alert_sms_phone.value)
  alert_voice_raw = trimspace(data.azurerm_key_vault_secret.alert_voice_phone.value)

  alert_email_configured = local.alert_email_raw != "" && local.alert_email_raw != "REPLACE_ME"

  alert_sms_digits = (
    local.alert_sms_raw != "" && local.alert_sms_raw != "REPLACE_ME" && startswith(local.alert_sms_raw, "+")
    ? substr(local.alert_sms_raw, 1, length(local.alert_sms_raw) - 1)
    : ""
  )
  alert_sms_match = (
    local.alert_sms_digits != "" && can(regex(local.alert_e164_dial_pattern, local.alert_sms_digits))
    ? regex(local.alert_e164_dial_pattern, local.alert_sms_digits)
    : null
  )
  alert_sms_configured = local.alert_sms_match != null

  alert_voice_digits = (
    local.alert_voice_raw != "" && local.alert_voice_raw != "REPLACE_ME" && startswith(local.alert_voice_raw, "+")
    ? substr(local.alert_voice_raw, 1, length(local.alert_voice_raw) - 1)
    : ""
  )
  alert_voice_match = (
    local.alert_voice_digits != "" && can(regex(local.alert_e164_dial_pattern, local.alert_voice_digits))
    ? regex(local.alert_e164_dial_pattern, local.alert_voice_digits)
    : null
  )
  alert_voice_configured = local.alert_voice_match != null

  # Notify: email ± SMS (Sev2). Critical: email + SMS + voice (Sev1). Watch: email only (Sev3).
  alert_notify_enabled   = local.alert_email_configured || local.alert_sms_configured
  alert_critical_enabled = local.alert_email_configured || local.alert_sms_configured || local.alert_voice_configured
  alert_watch_enabled    = local.alert_email_configured
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
  name                 = local.appi_name
  location             = azurerm_resource_group.main.location
  resource_group_name  = azurerm_resource_group.main.name
  workspace_id         = azurerm_log_analytics_workspace.main.id
  application_type     = "web"
  retention_in_days    = 30
  daily_data_cap_in_gb = 1
  # Email when nearing the daily cap (uses Azure subscription contacts / AI notifications).
  daily_data_cap_notifications_enabled = true
  sampling_percentage                  = 100
  tags                                 = local.tags
}

# Prod-only availability pings (1 geo, every 10 minutes) — homepage + materials (OPS-P2-001).
resource "azurerm_application_insights_standard_web_test" "homepage" {
  count = local.prod_availability_enabled ? 1 : 0

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

resource "azurerm_application_insights_standard_web_test" "resume_pdf" {
  count = local.prod_availability_enabled ? 1 : 0

  name                    = "webtest-elyse-resume-${local.name_suffix}"
  resource_group_name     = azurerm_resource_group.main.name
  location                = azurerm_resource_group.main.location
  application_insights_id = azurerm_application_insights.main.id
  geo_locations           = ["us-va-ash-azr"]
  frequency               = 600
  timeout                 = 30
  enabled                 = true
  retry_enabled           = true
  description             = "Resume PDF availability for ${var.custom_domain} (SLO-4)"
  tags                    = local.tags

  request {
    url                              = local.resume_pdf_url
    http_verb                        = "GET"
    parse_dependent_requests_enabled = false
    follow_redirects_enabled         = true
  }

  validation_rules {
    expected_status_code = 200
    ssl_check_enabled    = true
  }
}

resource "azurerm_application_insights_standard_web_test" "headshot" {
  count = local.prod_availability_enabled ? 1 : 0

  name                    = "webtest-elyse-headshot-${local.name_suffix}"
  resource_group_name     = azurerm_resource_group.main.name
  location                = azurerm_resource_group.main.location
  application_insights_id = azurerm_application_insights.main.id
  geo_locations           = ["us-va-ash-azr"]
  frequency               = 600
  timeout                 = 30
  enabled                 = true
  retry_enabled           = true
  description             = "Theatrical headshot availability for ${var.custom_domain} (SLO-4)"
  tags                    = local.tags

  request {
    url                              = local.headshot_url
    http_verb                        = "GET"
    parse_dependent_requests_enabled = false
    follow_redirects_enabled         = true
  }

  validation_rules {
    expected_status_code = 200
    ssl_check_enabled    = true
  }
}

# Sev2 — email ± SMS (OPS-P1-001 / OPS-P1-002). Skipped while ALERT-* are REPLACE_ME.
resource "azurerm_monitor_action_group" "notify" {
  count = local.alert_notify_enabled ? 1 : 0

  name                = "ag-elyse-notify-${local.name_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "elyn${local.name_suffix}"
  tags                = local.tags

  dynamic "email_receiver" {
    for_each = local.alert_email_configured ? [1] : []
    content {
      name                    = "ops-email"
      email_address           = local.alert_email_raw
      use_common_alert_schema = true
    }
  }

  dynamic "sms_receiver" {
    for_each = local.alert_sms_configured ? [1] : []
    content {
      name         = "ops-sms"
      country_code = local.alert_sms_match[0]
      phone_number = local.alert_sms_match[1]
    }
  }
}

# Sev1 — email + SMS + voice (OPS-P1-002). Homepage + materials availability use this group.
resource "azurerm_monitor_action_group" "critical" {
  count = local.alert_critical_enabled ? 1 : 0

  name                = "ag-elyse-critical-${local.name_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "elyc${local.name_suffix}"
  tags                = local.tags

  dynamic "email_receiver" {
    for_each = local.alert_email_configured ? [1] : []
    content {
      name                    = "ops-email"
      email_address           = local.alert_email_raw
      use_common_alert_schema = true
    }
  }

  dynamic "sms_receiver" {
    for_each = local.alert_sms_configured ? [1] : []
    content {
      name         = "ops-sms"
      country_code = local.alert_sms_match[0]
      phone_number = local.alert_sms_match[1]
    }
  }

  dynamic "voice_receiver" {
    for_each = local.alert_voice_configured ? [1] : []
    content {
      name         = "ops-voice"
      country_code = local.alert_voice_match[0]
      phone_number = local.alert_voice_match[1]
    }
  }
}

# Sev3 — email only (OPS-P2-002). FCP burn and other watch signals.
resource "azurerm_monitor_action_group" "watch" {
  count = local.alert_watch_enabled ? 1 : 0

  name                = "ag-elyse-watch-${local.name_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "elyw${local.name_suffix}"
  tags                = local.tags

  email_receiver {
    name                    = "ops-email"
    email_address           = local.alert_email_raw
    use_common_alert_schema = true
  }
}

# Sev2 — API error-budget burn vs SLO-7 99.9%/7d (OPS-P6-002).
# 99.9% over 7d ≈ 10.08 minutes of "bad" API time. Azure scheduled-query max
# lookback is P2D, so this alert uses the proportional 2d budget (~2.88 min)
# and fires when BadMinutes > 2 (3+ minutes). A minute is bad only when it has
# 2+ server errors (5xx / timeout) so a single stray 502 cannot page.
# 4xx and every CD quiet window (15m before / 10m after each
# DeployStarted/Completed) do not consume budget. Constants:
# scripts/lib/api-error-budget.mjs (keep this query in sync).
# CD emits DeployStarted immediately before SWA upload. Sev1 availability /
# DeployFailed / SmokeFailed still page during a real outage.
resource "azurerm_monitor_scheduled_query_rules_alert_v2" "failed_requests" {
  count = local.alert_notify_enabled ? 1 : 0

  name                    = "alert-elyse-failed-requests-${local.name_suffix}"
  resource_group_name     = azurerm_resource_group.main.name
  location                = azurerm_resource_group.main.location
  scopes                  = [azurerm_application_insights.main.id]
  description             = "API error-budget burn vs 99.9%/7d (SLO-7) on ${local.appi_name} (Sev2 → notify; 2d window)"
  severity                = 2
  enabled                 = true
  evaluation_frequency    = "PT15M"
  window_duration         = "P2D"
  skip_query_validation   = true
  auto_mitigation_enabled = true
  tags                    = local.tags

  criteria {
    query                   = <<-QUERY
      let quietMinutes =
        customEvents
        | where name in ("DeployStarted", "DeployCompleted")
        | extend QuietStart = timestamp - 15m, QuietEnd = timestamp + 10m
        | extend Minute = range(bin(QuietStart, 1m), bin(QuietEnd, 1m), 1m)
        | mv-expand Minute to typeof(datetime)
        | distinct Minute;
      requests
      | extend isServerError = success == false and (toint(resultCode) >= 500 or resultCode == "0" or isempty(resultCode))
      | extend Minute = bin(timestamp, 1m)
      | join kind=leftanti quietMinutes on Minute
      | summarize Failed = countif(isServerError) by Minute
      | summarize BadMinutes = countif(Failed >= 2)
      | project BadMinutes
    QUERY
    time_aggregation_method = "Total"
    metric_measure_column   = "BadMinutes"
    operator                = "GreaterThan"
    threshold               = 2

    failing_periods {
      minimum_failing_periods_to_trigger_alert = 1
      number_of_evaluation_periods             = 1
    }
  }

  action {
    action_groups = [azurerm_monitor_action_group.notify[0].id]
  }
}

resource "azurerm_monitor_metric_alert" "availability" {
  count = local.alert_critical_enabled && local.prod_availability_enabled ? 1 : 0

  name                = "alert-elyse-availability-${local.name_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_application_insights.main.id]
  description         = "Availability test failed for ${var.custom_domain} homepage or materials (Sev1 → critical)"
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
    action_group_id = azurerm_monitor_action_group.critical[0].id
  }
}

# Sev1 — Deploy Production or post-release Smoke Production failure (OPS-P3-003 / TEST-D-003).
# CD emits DeployFailed or SmokeFailed; pages notify AG (email + SMS, no voice).
# Homepage/materials availability still pages critical AG (email + SMS + voice).
resource "azurerm_monitor_scheduled_query_rules_alert_v2" "deploy_failed" {
  count = local.alert_notify_enabled && var.environment == "prod" ? 1 : 0

  name                    = "alert-elyse-deploy-failed-${local.name_suffix}"
  resource_group_name     = azurerm_resource_group.main.name
  location                = azurerm_resource_group.main.location
  scopes                  = [azurerm_application_insights.main.id]
  description             = "Deploy Production or Smoke Production failed (DeployFailed/SmokeFailed; Sev1 → notify email+SMS, no voice)"
  severity                = 1
  enabled                 = true
  evaluation_frequency    = "PT5M"
  window_duration         = "PT5M"
  skip_query_validation   = true
  auto_mitigation_enabled = true
  tags                    = local.tags

  criteria {
    query                   = <<-QUERY
      customEvents
      | where name in ("DeployFailed", "SmokeFailed")
      | where tostring(customDimensions.environment) == "prod"
    QUERY
    time_aggregation_method = "Count"
    operator                = "GreaterThan"
    threshold               = 0

    failing_periods {
      minimum_failing_periods_to_trigger_alert = 1
      number_of_evaluation_periods             = 1
    }
  }

  action {
    action_groups = [azurerm_monitor_action_group.notify[0].id]
  }
}

# Sev3 — homepage field FCP p75 burn (OPS-P2-002). Email-only watch group.
# Azure scheduled-query max lookback is P2D; committed SLO-6 (7d) is scored by the monthly
# scorecard Kusto probe. Alert fires as an early watch when 2d p75 > 1.5s with ≥10 samples.
# Auto-mitigate requires evaluation_frequency ≤ 12h; keep daily cadence without auto-mitigate.
resource "azurerm_monitor_scheduled_query_rules_alert_v2" "homepage_fcp" {
  count = local.alert_watch_enabled && var.environment == "prod" ? 1 : 0

  name                    = "alert-elyse-homepage-fcp-${local.name_suffix}"
  resource_group_name     = azurerm_resource_group.main.name
  location                = azurerm_resource_group.main.location
  scopes                  = [azurerm_application_insights.main.id]
  description             = "Homepage field FCP p75 over 1.5s / 2d watch window (Sev3 → watch email; SLO-6 scored over 7d in scorecard)"
  severity                = 3
  enabled                 = true
  evaluation_frequency    = "P1D"
  window_duration         = "P2D"
  skip_query_validation   = true
  auto_mitigation_enabled = false
  tags                    = local.tags

  criteria {
    query                   = <<-QUERY
      customMetrics
      | where name == "HomepageFcpMs"
      | summarize SampleCount = count(), FcpP75 = percentile(value, 75)
      | where SampleCount >= 10
      | project FcpP75
    QUERY
    time_aggregation_method = "Maximum"
    metric_measure_column   = "FcpP75"
    operator                = "GreaterThan"
    threshold               = 1500

    failing_periods {
      minimum_failing_periods_to_trigger_alert = 1
      number_of_evaluation_periods             = 1
    }
  }

  action {
    action_groups = [azurerm_monitor_action_group.watch[0].id]
  }
}
