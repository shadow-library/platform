# **Auth API Reference**

## **Base URL**

`https://identity.shadow-apps.com/api/v1`

## **0. Core Concepts & Error Handling**

### **Session and Token Handling via Cookies**

All successful authentication responses (Login, Register, Refresh) **DO NOT** return tokens in the JSON body. Instead, the server sets three secure cookies in the HTTP `Set-Cookie` header:

1. **Access Token (AT):** JWT. `HttpOnly`, `Secure`, `SameSite=Strict`. Valid \~1 hour.
2. **Refresh Token (RT):** Opaque string. `HttpOnly`, `Secure`, `SameSite=Strict`. Long-lived (e.g., 6 months).
3. **`isLoggedIn`:** Simple boolean flag. **NOT HttpOnly**, `Secure`, `SameSite=Strict`. Used by client-side JavaScript to detect session presence.

### **State Machine Logic**

The authentication flow is linear. Each endpoint expects the `flowId` to be in a specific `status`.

- **Skipping Steps:** If you try to call Step 3 while the flow is in Step 1, the API returns `409 Conflict`.
- **Going Back:** The API generally does not support "undoing" a step. To change previous data (e.g., wrong email), call `/auth/cancel` and start a new flow.
- **Replay:** If you try to submit the same success payload twice, the API returns `409 Conflict` (e.g., verifying an already verified OTP).

## **1. Registration Flow**

### **1.1 Initiate Registration**

**POST** `/auth/register/init`

- **Request Body:**

  ```json
  {
    "email": "jane.doe@example.com",
    "deviceId": "uuid-v4-string"
  }
  ```

- **Success Response (200 OK):**
  ```jsonc
  {
    "flowId": "auth_flow_123abc...", // The session token for this flow
    "status": "AWAITING_EMAIL_OTP", // The current node in your Mermaid diagram
  }
  ```

### **1.2 Verify Email OTP**

**POST** `/auth/challenge/verify`

- **Purpose:** Verifies OTP code in Registration.
- **Request Body:**

  ```jsonc
  {
    "flowId": "auth_flow_123abc...",
    "code": "123456",
  }
  ```

- **Success Response (200 OK):** Completed flow
  ```json
  {
    "flowId": "auth_flow_8372_xyz",
    "status": "AWAITING_DEMOGRAPHICS"
  }
  ```

### **1.3 Resend Email OTP**

**POST** `/auth/challenge/resend`

- **Purpose:** Request resend of email OTP in Registration.
- **Request Body:**

  ```jsonc
  {
    "flowId": "auth_flow_123abc...",
    "method": "EMAIL_OTP",
  }
  ```

- **Success Response (200 OK):** Completed flow
  ```jsonc
  {
    "flowId": "auth_flow_8372_xyz",
    "method": "EMAIL_OTP", // denotes what was resent
    "status": "SUCCESS", // denotes OTP send is success
    "retryAfterSeconds": 60, // denotes after what time this can be called again
  }
  ```

### **1.4 Set Demographics**

**POST** `/auth/register/demographics`

- **Request Body:**

  ```json
  {
    "flowId": "auth_flow_abc123...",
    "dateOfBirth": "1995-08-15",
    "gender": "FEMALE"
  }
  ```

- **Success Response (200 OK):**
  ```json
  {
    "flowId": "auth_flow_abc123...",
    "status": "AWAITING_PROFILE"
  }
  ```

### **1.5 Set Profile & Complete**

**POST** `/auth/register/profile`

- **Request Body:**

  ```json
  {
    "flowId": "auth_flow_abc123...",
    "firstName": "Jane",
    "lastName": "Doe"
  }
  ```

- **Success Response (200 OK):**
  Server sets AT, RT, and isLoggedIn cookies via headers.
  ```json
  {
    "flowId": "auth_flow_abc123...",
    "status": "COMPLETED"
  }
  ```

## **2. Login Flow**

### **2.1 Initiate Login**

**POST** `/auth/login/init`

- **Request Body:**

  ```json
  {
    "identifier": "jane.doe@example.com",
    "deviceId": "uuid-v4-string"
  }
  ```

- **Success Response (200 OK):**
  ```jsonc
  {
    "flowId": "auth_flow_123abc...", // The session token for this flow
    "status": "AWAITING_PASSWORD", // The current node in your Mermaid diagram
    "hasAlternativeMethods": true, // Tells the UI whether user has different auth modes he can select from
  }
  ```

### **2.2 Request/Resend Challenge**

**POST** `/auth/challenge/resend`

- **Purpose:** Triggers sending an OTP.
- **Request Body:**

  ```json
  {
    "flowId": "auth_flow_xyz789...",
    "method": "OTP_EMAIL"
  }
  ```

- **Success Response (200 OK):**
  ```json
  {
    "flowId": "auth_flow_8372_xyz",
    "method": "EMAIL_OTP", // denotes what was resent
    "status": "SUCCESS", // denotes OTP send is success
    "retryAfterSeconds": 60 // denotes after what time this can be called again
  }
  ```

### **2.3 Verify Credential**

**POST** `/auth/challenge/verify`

- **Request Body (Password Submission):**

  ```json
  {
    "flowId": "auth_flow_xyz789...",
    "password": "secretPassword123"
  }
  ```

- **Success Response (200 OK - Login Complete):**  
  Server sets AT, RT, and isLoggedIn cookies via headers.

  ```json
  {
    "flowId": "auth_flow_xyz789...",
    "status": "COMPLETED"
  }
  ```

- **Success Response (200 OK - Intermediate Step/MFA):**

  ```jsonc
  {
    "flowId": "auth_flow_xyz789...",
    "status": "AWAITING_TOTP",
    "attemptsLeft": 3, // number of attempts left before flow termination
    "resendsLeft": 3, // number of resends left, provided only in case of OTP

    // Context for UI, provide only what is required based on the auth method
    "metadata": {
      "maskedPhone": "**99",
      "maskedEmail": "u***@gmail.com",
    },
  }
  ```

### **2.4 List available challenges**

**GET** `/auth/challenge/methods?flowId=<flowId>`

- **Purpose:** return the list of challenges that the user can choose from at this point in the flow. This endpoint is useful for client UI to render selection (your SELECT_AUTH_MODE state).
- **Success Response (200 OK)**

  ```jsonc
  {
    "flowId": "auth_flow_8372_xyz",
    "methods": [
      {
        "name": "TOTP",
      },
      {
        "name": "SMS_OTP",
        "metadata": { "maskedPhone": "**99" },
      },
      {
        "name": "EMAIL_OTP",
        "metadata": { "maskedEmail": "u***@gmail.com" },
      },
    ],
  }
  ```

### **2.5 Change challenge**

**POST** `/auth/challenge/change`

- **Purpose**: user requests to switch active challenge (e.g., from `AWAITING_EMAIL_OTP` → `AWAITING_SMS_OTP`). Returns the updated set of available challenges and server action (send OTP, etc.).
- **Success Response (200 OK)**
  ```jsonc
  {
    "flowId": "auth_flow_8372_xyz",
    "status": "AWAITING_SMS_OTP", // State updated to the new method
    "hasAlternativeMethods": true, // They can still switch back if SMS fails
    "metadata": { "maskedPhone": "**99" },
  }
  ```

## **3. Account Recovery (Forgot Password)**

### **3.1 Initiate Recovery**

**POST** `/auth/recover/init`

- **Request Body:**
  ```json
  {
    "email": "jane.doe@example.com",
    "deviceId": "uuid-v4-string"
  }
  ```
- **Success Response:**

  ```jsonc
  {
    "flowId": "auth_flow_xyz123",
    "status": "AWAITING_SMS_OTP",
    "attemptsLeft": 3, // number of attempts left before flow termination
    "resendsLeft": 3, // number of resends left, provided only in case of OTP

    // Context for UI, provide only what is required based on the auth method
    "metadata": {
      "maskedPhone": "**99",
      "maskedEmail": "u***@gmail.com",
    },
  }
  ```

### **3.2 Verify Recovery OTP**

**POST** `/auth/challenge/verify`

- **Purpose:** Verifies recovery OTP.
- **Request Body:**

  ```json
  {
    "flowId": "auth_flow_xyz123",
    "code": "987654"
  }
  ```

- **Success Response:**
  ```json
  {
    "flowId": "auth_flow_xyz123",
    "status": "AWAITING_NEW_PASSWORD"
  }
  ```

### **3.3 Reset Password**

**POST** `/auth/recover/reset`

- **Request Body:**

  ```json
  {
    "flowId": "auth_flow_xyz123",
    "newPassword": "NewSecurePassword123!"
  }
  ```

- **Success Response (200 OK):**  
  Server sets AT, RT, and isLoggedIn cookies via headers.
  ```json
  {
    "flowId": "auth_flow_xyz123",
    "status": "COMPLETED"
  }
  ```

## **4. Auxiliary Routes**

### **4.3 Refresh Session**

Exchanges tokens for a new Access Token (and potentially a new Refresh Token).  
**POST** `/auth/session/refresh`

- **Request Body:** Empty (Reads refreshToken and accessToken from cookies).
- **Success Response (204 No Content):** Server sets new AT, (potentially new) RT, and isLoggedIn cookies via headers.
- **Error (403 Forbidden):** code: "token_revoked"

### **4.4 Global Sign Out**

Terminates the **primary Identity Service session** and all associated service tokens.  
**POST** `/auth/signout`

- **Request Body:** Empty (Reads accessToken from cookie to identify the session)
- **Success Response (204 No Content):** Server clears AT, RT, and isLoggedIn cookies via headers.
