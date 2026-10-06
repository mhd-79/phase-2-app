# Super Admin & Multi-Tenant Management Specification

<document>
  <title>Super Admin & Tenant Onboarding Specification</title>
  <version>1.0</version>
  <status>Implementation Ready</status>

  <purpose>
    Add a Super Admin layer above the existing HO Admin and Outlet hierarchy.
    The Super Admin manages tenants, tenant onboarding, invitations, trial
    accounts, subscriptions, and platform-level administration.
  </purpose>

  <project_rules>
    <rule>Follow the existing SRS and prototype as the primary UI/UX references.</rule>
    <rule>Make surgical changes only; do not redesign unrelated modules.</rule>
    <rule>Keep the existing Angular, FastAPI, PostgreSQL, Prisma, PWA, and responsive architecture.</rule>
    <rule>Maintain strict tenant data isolation.</rule>
    <rule>The public tenant-registration website is NOT part of the current implementation.</rule>
    <rule>Create the backend/API foundation so the public website can be connected later.</rule>
  </project_rules>

  <hierarchy>
    <level order="1">Super Admin</level>
    <level order="2">Tenant / Business</level>
    <level order="3">HO Admin</level>
    <level order="4">Outlet Admin</level>
    <level order="5">Cashier</level>
  </hierarchy>

  <role_permissions>
    <super_admin>
      <description>
        Platform-level administrator who can manage all tenants and platform
        configuration. Super Admin is not restricted to one tenant.
      </description>
      <permissions>
        <permission>View all tenants</permission>
        <permission>Create tenants</permission>
        <permission>Approve tenant requests</permission>
        <permission>Reject tenant requests</permission>
        <permission>Send and resend tenant invitations</permission>
        <permission>Activate or suspend tenants</permission>
        <permission>View tenant details</permission>
        <permission>Manage subscription plans</permission>
        <permission>View tenant subscription status</permission>
        <permission>View platform-level analytics</permission>
        <permission>View audit logs</permission>
      </permissions>
    </super_admin>

    <tenant>
      <description>
        A tenant represents one independent business or organization using
        the billing and POS platform.
      </description>
    </tenant>

    <ho_admin>
      <description>
        The main administrator of one tenant. HO Admin can manage only the
        tenant to which the account belongs and its outlets.
      </description>
    </ho_admin>

    <outlet_admin>
      <description>
        Manages an assigned outlet and its permitted operations.
      </description>
    </outlet_admin>

    <cashier>
      <description>
        Performs permitted cashier and billing operations for the assigned outlet.
      </description>
    </cashier>
  </role_permissions>

  <tenant_isolation>
    <rule>
      Every tenant must have a unique tenant_id.
    </rule>
    <rule>
      Tenant-owned records must be associated with tenant_id.
    </rule>
    <rule>
      Outlet-owned records must also be associated with outlet_id where applicable.
    </rule>
    <rule>
      Tenant A must never be able to read, modify, or delete Tenant B data.
    </rule>
    <rule>
      HO Admin can access only its own tenant and its outlets.
    </rule>
    <rule>
      Outlet users can access only data allowed for their assigned outlet.
    </rule>
    <rule>
      Super Admin can access tenant-level information across the platform.
    </rule>
    <data_scope>
      <example>
        tenant_id -> outlet_id -> users/products/inventory/sales/purchases/customers/vendors/reports
      </example>
    </data_scope>
  </tenant_isolation>

  <tenant_onboarding>
    <description>
      There are two supported ways to add a new tenant.
    </description>

    <method id="1" name="Website Tenant Request" status="hold">
      <description>
        A future public website will allow a business owner to submit a
        tenant-registration request. The website is not being created now.
        Only the backend/API foundation should be prepared.
      </description>

      <flow>
        <step order="1">User opens the future public website.</step>
        <step order="2">User selects Start Free Trial or Register Business.</step>
        <step order="3">User enters business and owner information.</step>
        <step order="4">Website submits the request to the tenant-request API.</step>
        <step order="5">System creates a tenant request with PENDING_APPROVAL status.</step>
        <step order="6">Super Admin receives an email notification.</step>
        <step order="7">Super Admin receives an in-app notification.</step>
        <step order="8">Super Admin reviews the request.</step>
        <step order="9">Super Admin approves or rejects the request.</step>
        <step order="10">If approved, the system sends an invitation email.</step>
        <step order="11">Tenant opens the invitation and verifies the invitation token.</step>
        <step order="12">Tenant creates a password.</step>
        <step order="13">Tenant account becomes active in TRIAL status.</step>
        <step order="14">Tenant logs in and uses the application during the trial.</step>
        <step order="15">Tenant pays for a subscription after the trial.</step>
        <step order="16">Subscription changes from TRIAL to ACTIVE after successful payment.</step>
      </flow>
    </method>

    <method id="2" name="Super Admin Creates Tenant" status="current">
      <description>
        This is the primary onboarding method to implement now.
        Super Admin directly enters the tenant details and sends an invitation.
      </description>

      <flow>
        <step order="1">Super Admin opens Tenants.</step>
        <step order="2">Super Admin selects Add Tenant.</step>
        <step order="3">Super Admin enters tenant and owner details.</step>
        <step order="4">System creates the tenant.</step>
        <step order="5">System creates the tenant invitation.</step>
        <step order="6">System sends an invitation email.</step>
        <step order="7">Tenant opens the invitation.</step>
        <step order="8">System validates the invitation token.</step>
        <step order="9">Tenant creates a password.</step>
        <step order="10">Tenant account becomes available for login.</step>
        <step order="11">Tenant logs in with TRIAL subscription status.</step>
        <step order="12">Trial period is tracked using trial start and end dates.</step>
        <step order="13">Tenant selects a subscription plan after or before trial expiry.</step>
        <step order="14">Tenant completes payment.</step>
        <step order="15">Subscription becomes ACTIVE after successful payment.</step>
      </flow>
    </method>
  </tenant_onboarding>

  <tenant_information>
    <required_fields>
      <field>tenant_name</field>
      <field>legal_business_name</field>
      <field>owner_name</field>
      <field>email</field>
      <field>phone</field>
      <field>address</field>
      <field>city</field>
      <field>state</field>
      <field>country</field>
      <field>postal_code</field>
      <field>gstin</field>
      <field>business_type</field>
    </required_fields>

    <optional_on_creation>
      <field>initial_outlet_name</field>
      <field>trial_duration</field>
      <field>subscription_plan</field>
    </optional_on_creation>
  </tenant_information>

  <tenant_status_lifecycle>
    <status name="PENDING_APPROVAL">
      Tenant request is waiting for Super Admin review.
    </status>
    <status name="APPROVED">
      Super Admin has approved the tenant request.
    </status>
    <status name="INVITED">
      Tenant has been created and an invitation has been sent.
    </status>
    <status name="ACTIVATED">
      Tenant has accepted the invitation and completed account setup.
    </status>
    <status name="TRIAL">
      Tenant is actively using the system under the trial period.
    </status>
    <status name="ACTIVE">
      Tenant has an active paid subscription.
    </status>
    <status name="EXPIRED">
      Trial or paid subscription has expired.
    </status>
    <status name="SUSPENDED">
      Tenant access has been disabled by Super Admin.
    </status>
    <status name="REJECTED">
      Tenant request was rejected by Super Admin.
    </status>
    <status name="INVITATION_EXPIRED">
      Invitation token has expired before being accepted.
    </status>
  </tenant_status_lifecycle>

  <invitation_system>
    <description>
      Tenant invitations must use a secure, unique, single-use token.
    </description>

    <invitation_fields>
      <field>invitation_id</field>
      <field>tenant_id</field>
      <field>email</field>
      <field>token</field>
      <field>expires_at</field>
      <field>used_at</field>
      <field>created_at</field>
      <field>accepted_at</field>
      <field>status</field>
    </invitation_fields>

    <rules>
      <rule>Invitation tokens must be unique.</rule>
      <rule>Invitation tokens must expire after a configured period.</rule>
      <rule>An invitation token can be used only once.</rule>
      <rule>Used or expired tokens cannot be reused.</rule>
      <rule>Super Admin can resend an invitation.</rule>
      <rule>Resending an invitation should invalidate the previous active token.</rule>
      <rule>Invitation acceptance must not automatically grant Super Admin privileges.</rule>
    </rules>

    <email_content>
      <subject>Invitation to join OKUTO Billing &amp; POS</subject>
      <message>
        The tenant receives an invitation to activate the business account,
        verify the invitation, create a password, and log in to the application.
      </message>
    </email_content>
  </invitation_system>

  <password_setup>
    <flow>
      <step order="1">Tenant opens the invitation link.</step>
      <step order="2">Backend validates the token.</step>
      <step order="3">Tenant enters and confirms a password.</step>
      <step order="4">Backend stores the password according to the application's authentication/security policy.</step>
      <step order="5">Invitation is marked as used.</step>
      <step order="6">Tenant account becomes eligible for login.</step>
      <step order="7">Tenant logs in with the invited email and newly created password.</step>
    </flow>
  </password_setup>

  <trial_management>
    <description>
      Every approved and activated tenant can be placed into a trial period.
    </description>

    <fields>
      <field>trial_start_date</field>
      <field>trial_end_date</field>
      <field>trial_duration_days</field>
      <field>subscription_status</field>
      <field>current_plan</field>
      <field>subscription_start_date</field>
      <field>subscription_end_date</field>
      <field>payment_status</field>
    </fields>

    <example>
      <tenant>ABC Supermarket</tenant>
      <plan>Starter Trial</plan>
      <status>TRIAL</status>
      <payment_status>NOT_PAID</payment_status>
    </example>

    <trial_end_behavior>
      <before_expiry>
        Tenant can continue normal trial usage.
      </before_expiry>
      <near_expiry>
        Application should show subscription/upgrade reminders.
      </near_expiry>
      <after_expiry>
        Tenant access should follow the configured expired-trial policy.
        The tenant should be prompted to select a paid plan.
      </after_expiry>
      <after_payment>
        Successful payment changes the subscription status to ACTIVE.
      </after_payment>
    </trial_end_behavior>
  </trial_management>

  <subscription_management>
    <current_scope>
      Build the subscription data model and status lifecycle now.
      Full payment gateway integration can be implemented later.
    </current_scope>

    <future_flow>
      <step order="1">Tenant views available plans.</step>
      <step order="2">Tenant selects a plan.</step>
      <step order="3">Tenant starts checkout.</step>
      <step order="4">Payment gateway processes payment.</step>
      <step order="5">Backend verifies payment.</step>
      <step order="6">Subscription becomes ACTIVE.</step>
      <step order="7">Tenant receives payment/subscription confirmation.</step>
    </future_flow>

    <plan_controls>
      <control>Number of outlets</control>
      <control>Number of users</control>
      <control>Storage limit</control>
      <control>AI feature availability</control>
      <control>Report availability</control>
      <control>Subscription duration</control>
    </plan_controls>
  </subscription_management>

  <super_admin_dashboard>
    <dashboard_cards>
      <card>Total Tenants</card>
      <card>Active Tenants</card>
      <card>Trial Tenants</card>
      <card>Pending Requests</card>
      <card>Expired Tenants</card>
      <card>Suspended Tenants</card>
      <card>Total Outlets</card>
      <card>Total Users</card>
    </dashboard_cards>

    <navigation>
      <item>Dashboard</item>
      <item>Tenants</item>
      <item>Pending Requests</item>
      <item>Invitations</item>
      <item>Subscriptions</item>
      <item>Plans</item>
      <item>Users</item>
      <item>Notifications</item>
      <item>Audit Logs</item>
      <item>System Settings</item>
    </navigation>
  </super_admin_dashboard>

  <tenant_management>
    <actions>
      <action>Add Tenant</action>
      <action>View Tenant</action>
      <action>Edit Tenant</action>
      <action>Activate Tenant</action>
      <action>Suspend Tenant</action>
      <action>Reactivate Tenant</action>
      <action>Send Invitation</action>
      <action>Resend Invitation</action>
      <action>View Subscription</action>
      <action>View Outlets</action>
      <action>View Users</action>
    </actions>

    <tenant_details>
      <section>Business Information</section>
      <section>Owner Information</section>
      <section>HO Admin Information</section>
      <section>Outlet Information</section>
      <section>User Information</section>
      <section>Subscription Information</section>
      <section>Trial Information</section>
      <section>Activity Information</section>
      <section>Audit History</section>
    </tenant_details>
  </tenant_management>

  <api_interface>
    <description>
      These APIs provide the initial interface for Super Admin tenant
      onboarding and approval. The public website can consume the same
      tenant-request APIs later.
    </description>

    <tenant_request_apis>
      <api method="POST" path="/api/tenant-requests">
        Create a tenant request. Intended for the future public website.
      </api>
      <api method="GET" path="/api/super-admin/tenant-requests">
        List tenant requests for Super Admin.
      </api>
      <api method="GET" path="/api/super-admin/tenant-requests/{id}">
        View a specific tenant request.
      </api>
      <api method="POST" path="/api/super-admin/tenant-requests/{id}/approve">
        Approve a pending tenant request.
      </api>
      <api method="POST" path="/api/super-admin/tenant-requests/{id}/reject">
        Reject a pending tenant request.
      </api>
    </tenant_request_apis>

    <tenant_apis>
      <api method="POST" path="/api/super-admin/tenants">
        Create a tenant directly from Super Admin.
      </api>
      <api method="GET" path="/api/super-admin/tenants">
        List and filter tenants.
      </api>
      <api method="GET" path="/api/super-admin/tenants/{id}">
        View tenant details.
      </api>
      <api method="PUT" path="/api/super-admin/tenants/{id}">
        Update tenant information.
      </api>
      <api method="PATCH" path="/api/super-admin/tenants/{id}/status">
        Change tenant status.
      </api>
    </tenant_apis>

    <invitation_apis>
      <api method="POST" path="/api/super-admin/tenants/{id}/invite">
        Generate and send a tenant invitation.
      </api>
      <api method="GET" path="/api/invitations/{token}">
        Validate and retrieve invitation information.
      </api>
      <api method="POST" path="/api/invitations/{token}/accept">
        Accept an invitation and complete tenant account activation.
      </api>
    </invitation_apis>

    <authentication_apis>
      <api method="POST" path="/api/auth/set-password">
        Create the tenant user's password after invitation verification.
      </api>
      <api method="POST" path="/api/auth/login">
        Authenticate a tenant user.
      </api>
      <api method="POST" path="/api/auth/forgot-password">
        Start the password recovery process.
      </api>
    </authentication_apis>

    <subscription_apis>
      <api method="GET" path="/api/subscriptions/plans">
        List available subscription plans.
      </api>
      <api method="POST" path="/api/subscriptions/checkout">
        Start subscription checkout. Payment integration can be added later.
      </api>
      <api method="POST" path="/api/subscriptions/payment">
        Process or verify subscription payment.
      </api>
      <api method="GET" path="/api/subscriptions/status">
        Return the current tenant subscription status.
      </api>
    </subscription_apis>
  </api_interface>

  <notifications>
    <super_admin>
      <notification>New tenant registration request received.</notification>
      <notification>Tenant invitation accepted.</notification>
      <notification>Tenant trial is ending.</notification>
      <notification>Tenant subscription expired.</notification>
      <notification>Tenant payment/subscription status changed.</notification>
    </super_admin>

    <tenant>
      <notification>Invitation received.</notification>
      <notification>Invitation is about to expire.</notification>
      <notification>Trial is ending soon.</notification>
      <notification>Trial has expired.</notification>
      <notification>Subscription activated.</notification>
      <notification>Subscription payment confirmation.</notification>
    </tenant>
  </notifications>

  <audit_logs>
    <description>
      All important Super Admin and tenant onboarding actions must be auditable.
    </description>
    <events>
      <event>Tenant request created</event>
      <event>Tenant request approved</event>
      <event>Tenant request rejected</event>
      <event>Tenant created</event>
      <event>Invitation generated</event>
      <event>Invitation resent</event>
      <event>Invitation accepted</event>
      <event>Password setup completed</event>
      <event>Tenant activated</event>
      <event>Tenant suspended</event>
      <event>Tenant reactivated</event>
      <event>Subscription changed</event>
      <event>Payment status changed</event>
    </events>
    <fields>
      <field>actor_user_id</field>
      <field>actor_role</field>
      <field>tenant_id</field>
      <field>action</field>
      <field>timestamp</field>
      <field>ip_address</field>
      <field>metadata</field>
    </fields>
  </audit_logs>

  <security>
    <rule>Super Admin must have a dedicated role and protected endpoints.</rule>
    <rule>Only authorized Super Admin users can approve or reject tenant requests.</rule>
    <rule>Tenant invitation tokens must be single-use and time-limited.</rule>
    <rule>Tenant users must not receive Super Admin permissions through invitation acceptance.</rule>
    <rule>Every tenant-scoped API request must enforce tenant isolation.</rule>
    <rule>Super Admin actions must be recorded in audit logs.</rule>
    <rule>Expired, suspended, or invalid tenant accounts must follow the configured access policy.</rule>
    <rule>Subscription status must be checked before allowing subscription-restricted functionality.</rule>
  </security>

  <implementation_scope>
    <phase_now>
      <item>Super Admin role</item>
      <item>Super Admin authentication and authorization</item>
      <item>Tenant model and tenant_id isolation</item>
      <item>Super Admin tenant creation</item>
      <item>Tenant invitation model</item>
      <item>Invitation token generation and validation</item>
      <item>Invitation acceptance</item>
      <item>Password creation</item>
      <item>Tenant login</item>
      <item>Trial lifecycle</item>
      <item>Tenant status lifecycle</item>
      <item>Tenant request APIs for future website integration</item>
      <item>Super Admin approval/rejection APIs</item>
      <item>Email notification interface</item>
      <item>In-app notification interface</item>
      <item>Audit logging</item>
      <item>Subscription data model and status foundation</item>
    </phase_now>

    <hold_for_later>
      <item>Public tenant-registration website</item>
      <item>Production payment gateway integration</item>
      <item>Automated subscription billing</item>
      <item>Advanced subscription analytics</item>
    </hold_for_later>
  </implementation_scope>

  <acceptance_criteria>
    <criterion>
      Super Admin can create a tenant and send an invitation without using the public website.
    </criterion>
    <criterion>
      Tenant can open a valid invitation, create a password, and log in.
    </criterion>
    <criterion>
      Tenant starts with TRIAL status after successful onboarding.
    </criterion>
    <criterion>
      Trial start and end dates are stored and enforced.
    </criterion>
    <criterion>
      A tenant cannot access another tenant's data.
    </criterion>
    <criterion>
      Super Admin can list, view, approve, reject, activate, suspend, and reactivate tenants as permitted.
    </criterion>
    <criterion>
      Invitation tokens cannot be reused after acceptance or expiration.
    </criterion>
    <criterion>
      The future public website can submit tenant requests using the prepared tenant-request API.
    </criterion>
    <criterion>
      Tenant subscription status can transition from TRIAL to ACTIVE after payment verification.
    </criterion>
    <criterion>
      Important onboarding and Super Admin actions are recorded in audit logs.
    </criterion>
  </acceptance_criteria>
</document>
