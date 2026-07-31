# Engineering Standards & Conventions

## 1. Resource Identification (ID Prefixes)

To ensure easy identification and debugging across logs, databases, and API responses, all resource IDs must be prefixed with their resource type followed by an underscore.

**Format:** `{resource_type}_{uuid/random_string}`

| Resource Entity         | Prefix       | Example ID              |
| :---------------------- | :----------- | :---------------------- |
| **Authentication Flow** | `flow_auth_` | `flow_auth_8372_xyz...` |
| **User**                | `usr_`       | `usr_9a8b7c...`         |
| **Session**             | `sess_`      | `sess_1x2y3z...`        |
| **Organization/Team**   | `org_`       | `org_ab12cd...`         |
| **Application/Client**  | `app_`       | `app_client_001...`     |

## 2. Localization & Response Strategy (No "Message" Strings)

### Reasoning

1.  **Localization (i18n):** The Frontend is responsible for translation. It maps a code like `INVALID_CREDENTIALS` to the user's preferred language (e.g., `t('errors.invalid_credentials')`).
2.  **Consistency:** Text strings often change during development or design reviews. Error codes are immutable contracts that prevent Frontend regressions.
3.  **Separation of Concerns:** The Backend handles **Business Logic** (Validation/State); the Frontend handles **Presentation Logic** (Text/Tone).

### **Implementation Examples**

**❌ Incorrect (Sending Display Text)**

```json
{
  "status": "AWAITING_SMS_OTP",
  "message": "We have sent a code to your phone.", // DO NOT DO THIS
  "error": "The code you entered is wrong." // DO NOT DO THIS
}
```

**✅ Correct (State & Codes)**

```json
{
  "status": "AWAITING_SMS_OTP",
  "metadata": { "maskedPhone": "**99" }, // UI determines the "Sent to..." text
  "attempts_left": 2
}
```

UI Labels: `SMS sent to **99`, `Attempts Left: 2`
