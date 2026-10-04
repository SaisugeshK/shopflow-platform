package com.shopflow.tenancy;

import org.springframework.jdbc.datasource.ConnectionHolder;
import org.springframework.jdbc.datasource.DelegatingDataSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Applies {@link TenantContext} to every connection handed out by the pool, as the PostgreSQL settings
 * {@code app.tenant_id} and {@code app.platform_access} that the row-level-security policies read (V8 migration).
 * When the application connects as a superuser (local development, tests) it also switches to the non-superuser role
 * {@code shopflow_rls}, because superusers bypass RLS; this starts only after the migrations have run.
 */
public class TenantAwareDataSource extends DelegatingDataSource {

    static final String RLS_ROLE = "shopflow_rls";

    private volatile boolean useRlsRole;

    public TenantAwareDataSource(DataSource target) {
        super(target);
        TenantContext.onChange(this::applyToBoundConnection);
    }

    @Override
    public Connection getConnection() throws SQLException {
        return applied(super.getConnection(), TenantContext.current());
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        return applied(super.getConnection(username, password), TenantContext.current());
    }

    /** A view whose connections always have platform access (test fixtures, administrative tooling). */
    public DataSource platformView() {
        TenantAwareDataSource self = this;
        return new DelegatingDataSource(getTargetDataSource()) {
            @Override
            public Connection getConnection() throws SQLException {
                return self.applied(super.getConnection(), new TenantContext.State(null, true));
            }
        };
    }

    void enableRlsRole() {
        this.useRlsRole = true;
    }

    boolean rlsRoleEnabled() {
        return useRlsRole;
    }

    private Connection applied(Connection connection, TenantContext.State state) throws SQLException {
        try {
            apply(connection, state);
            return connection;
        } catch (SQLException | RuntimeException e) {
            connection.close();
            throw e;
        }
    }

    private void apply(Connection connection, TenantContext.State state) throws SQLException {
        // Values are a UUID's canonical form and a fixed on/off literal, so building the SQL text is injection-safe;
        // one round trip per checkout.
        String tenant = state.tenantId() == null ? "" : state.tenantId().toString();
        String sql = (useRlsRole ? "SET ROLE " + RLS_ROLE + "; " : "")
                + "SELECT set_config('app.tenant_id', '" + tenant + "', false), "
                + "set_config('app.platform_access', '" + (state.platform() ? "on" : "off") + "', false)";
        try (Statement st = connection.createStatement()) {
            st.execute(sql);
        }
    }

    /** A context switch inside a running transaction must reach the connection that transaction already holds. */
    private void applyToBoundConnection() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            return;
        }
        Object resource = TransactionSynchronizationManager.getResource(this);
        if (resource instanceof ConnectionHolder holder && holder.getConnectionHandle() != null) {
            try {
                apply(holder.getConnection(), TenantContext.current());
            } catch (SQLException e) {
                throw new IllegalStateException("Could not switch the tenant on the current connection", e);
            }
        }
    }
}
