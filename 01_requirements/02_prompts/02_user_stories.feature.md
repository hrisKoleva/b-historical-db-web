


Feature: Suppliers search criteria

    Given I've logged in into https://upklinge-hdbt.azurewebsites.net with my Microsoft Entra ID account (Azure user group)
    When I click on the "Suppliers" card
    Then I see the following search criteria:
    - Supplier Name
    - Supplier Number
    - Supplier phone number
    - Supplier email address
    - Supplier address
    - Supplier city
    - Supplier state
    - Supplier zip code
    - Supplier country
    - Supplier website

Feature: Get customer orders for a customer

    Given I've logged in into https://upklinge-hdbt.azurewebsites.net with my Microsoft Entra ID account (Azure user group)
    When I click on the "Customer Orders" card
    Then I see a list of customer orders for the customer "Hyundai Heavy"
    And the list contains all customer orders for the customer "Hyundai Heavy"

    See 01_use_cases.md for the use case details and the tables to use for the search.
    