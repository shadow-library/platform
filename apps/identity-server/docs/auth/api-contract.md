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

The authentication flow is linear. Each endpoint expects the `flowId` to be in a specific `flowStatus`.

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
  ```json
  {
    "flowId": "flow_abc123...",
    "flowStatus": "REGISTRATION_INIT",
    "nextStep": "OTP_EMAIL"
  }
  ```

### **1.2 Verify Email OTP, Credentials, and MFA**

**POST** `/auth/verify`

- **Purpose:** Verifies OTP code in Registration.
- **Request Body:**

  ```json
  {
    "flowId": "flow_abc123...",
    "method": "OTP_EMAIL",
    "code": "123456"
  }
  ```

- **Success Response (200 OK):**
  ```json
  {
    "flowId": "flow_abc123...",
    "flowStatus": "EMAIL_VERIFIED",
    "nextStep": "SET_DEMOGRAPHICS"
  }
  ```

### **1.3 Set Demographics**

**POST** `/auth/register/demographics`

- **Request Body:**

  ```json
  {
    "flowId": "flow_abc123...",
    "dateOfBirth": "1995-08-15",
    "gender": "FEMALE"
  }
  ```

- **Success Response (200 OK):**
  ```json
  {
    "flowId": "flow_abc123...",
    "flowStatus": "DEMOGRAPHICS_SET",
    "nextStep": "SET_PROFILE"
  }
  ```

### **1.4 Set Profile & Complete**

**POST** `/auth/register/profile`

- **Request Body:**

  ```json
  {
    "flowId": "flow_abc123...",
    "firstName": "Jane",
    "lastName": "Doe"
  }
  ```

- **Success Response (200 OK):**
  Server sets AT, RT, and isLoggedIn cookies via headers.
  ```json
  {
    "flowId": "flow_abc123...",
    "flowStatus": "COMPLETED"
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
  ```json
  {
    "flowId": "flow_xyz789...",
    "flowStatus": "IDENTIFIED",
    "allowedMethods": [{ "method": "OTP_EMAIL", "maskedTarget": "j***@example.com" }, { "method": "PASSWORD" }],
    "nextStep": "LOGIN"
  }
  ```

### **2.2 Request/Resend Challenge**

**POST** `/auth/challenge`

- **Purpose:** Triggers sending an OTP.
- **Request Body:**

  ```json
  {
    "flowId": "flow_xyz789...",
    "method": "OTP_EMAIL"
  }
  ```

- **Success Response (200 OK):**
  ```json
  {
    "flowId": "flow_xyz789...",
    "message": "Challenge sent successfully."
  }
  ```

### **2.3 Verify Credential**

**POST** `/auth/verify`

- **Request Body (Password Submission):**

  ```json
  {
    "flowId": "flow_xyz789...",
    "method": "PASSWORD",
    "password": "secretPassword123"
  }
  ```

- **Success Response (200 OK - Login Complete):**  
  Server sets AT, RT, and isLoggedIn cookies via headers.

  ```json
  {
    "flowId": "flow_xyz789...",
    "flowStatus": "COMPLETED",
    "message": "Login successful. Check cookies for session tokens."
  }
  ```

- **Success Response (200 OK - Intermediate Step/MFA):**
  ```json
  {
    "flowId": "flow_xyz789...",
    "flowStatus": "MFA_REQUIRED",
    "allowedMethods": [{ "method": "TOTP" }],
    "nextStep": "MFA"
  }
  ```

## **3. Account Recovery (Forgot Password)**

### **3.1 Initiate Recovery**

**POST** `/auth/recover/init`

- **Request Body:**
  ```json
  {
    "email": "jane.doe@example.com"
  }
  ```
- **Success Response:**
  ```json
  {
    "flowId": "...",
    "flowStatus": "RECOVERY_MODE",
    "nextStep": "OTP_EMAIL"
  }
  ```

### **3.2 Verify Recovery OTP**

**POST** `/auth/verify`

- **Purpose:** Verifies recovery OTP.
- **Request Body:**

  ```json
  {
    "flowId": "flow_xyz123",
    "method": "OTP_EMAIL",
    "code": "987654"
  }
  ```

- **Success Response:**
  ```json
  {
    "flowId": "flow_xyz123",
    "flowStatus": "RECOVERY_VERIFIED",
    "nextStep": "SET_PASSWORD"
  }
  ```

### **3.3 Reset Password**

**POST** `/auth/recover/reset`

- **Request Body:**

  ```json
  {
    "flowId": "flow_xyz123",
    "newPassword": "NewSecurePassword123!"
  }
  ```

- **Success Response (200 OK):**  
  Server sets AT, RT, and isLoggedIn cookies via headers.
  ```json
  {
    "flowId": "flow_xyz123",
    "flowStatus": "COMPLETED",
    "message": "Password reset successful and user logged in."
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
