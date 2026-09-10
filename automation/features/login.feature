@REQ-AUTH-001 @SCN-001 @smoke
Feature: Customer login
  As an active customer
  I want to sign in
  So that I can reach the welcome state

  @TC-SAMPLE-001
  Scenario: Active customer signs in successfully
    Given the customer is on the login page
    When the customer signs in with valid credentials
    Then the welcome message is shown
