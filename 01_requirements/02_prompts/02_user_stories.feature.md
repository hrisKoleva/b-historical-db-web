Feature: Historical Database dashboard overview

  Scenario: View the entity summary cards
    Given I've logged in into https://upklinge-hdbt.azurewebsites.net with my Microsoft Entra ID account (Azure user group)
    Then I see a dashboard with cards showing the total number of Customers, Suppliers, Customer Orders, Purchase Orders, Manufacturing Orders, Items (Products, Articles), Components, and Drawings


Feature: Customers search criteria

    Given I've logged in into https://upklinge-hdbt.azurewebsites.net with my Microsoft Entra ID account (Azure user group)
    When I click on the "Customers" card
    Then I see the following search criteria:
    - Customer Name
    - Customer Number
    - Customer phone number
    - Customer email address
    - Customer address
    - Customer city
    - Customer state
    - Customer zip code
    - Customer country
    - Customer website
    - Customer industry
    - Customer Order Numbers

Feature: Search for a Customer  
    
    Given I've logged in into https://upklinge-hdbt.azurewebsites.net with my Microsoft Entra ID account (Azure user group)
    Then I see a search input field for "Customer Name"
    When I enter "Hyundai Heavy" into the search input field
    Then I see a list of customers matching the search criteria
    And the list contains the customer "Hyundai Heavy"
    And the list contains the customer "Hyundai Heavy Industries"
    And the list contains the customer "Hyundai Heavy Industries Co., Ltd."

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
    