# Customer Login — Customer Requirements Specification

## Context
The demonstration web application provides customer sign-in. The supported test
environment is the local sample application at `http://127.0.0.1:4173`.

## Functional requirements

### REQ-AUTH-001 — Successful login
The system shall allow an active customer to sign in with the email
`qa@example.com` and password `Correct123!`. After sign-in, the customer shall see
the message `Welcome, QA Customer`.

### REQ-AUTH-002 — Invalid credentials
When a customer submits an unknown email or an incorrect password, the system shall
remain on the login page and display `Invalid email or password`.

### REQ-AUTH-003 — Required fields
Email and password are mandatory. The system shall prevent an empty form submission
and identify the missing fields using native validation.

## Quality requirements

### REQ-NFR-001 — Browser coverage
The critical login flow must be testable in Chromium, Firefox, and WebKit desktop
browsers at a 1280 by 720 viewport.

### REQ-NFR-002 — Evidence
On automated-test failure, the test run must retain a screenshot and a Playwright
trace. Video must be retained for the first retry.

## Acceptance criteria

- A valid active customer reaches the welcome state.
- Invalid credentials do not expose which credential was incorrect.
- Empty mandatory fields cannot be submitted.
