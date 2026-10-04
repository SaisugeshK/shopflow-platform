package com.shopflow.tenancy;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.util.List;

/** Wraps the pooled DataSource with {@link TenantAwareDataSource} (§0B.3). */
@Configuration(proxyBeanMethods = false)
public class TenancyDataSourceConfig {

    private static final Logger log = LoggerFactory.getLogger(TenancyDataSourceConfig.class);

    @Bean
    static BeanPostProcessor tenantAwareDataSourcePostProcessor() {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String beanName) {
                if (bean instanceof DataSource ds && !(bean instanceof TenantAwareDataSource)) {
                    return new TenantAwareDataSource(ds);
                }
                return bean;
            }
        };
    }

    /**
     * Runs after every singleton (including the Flyway migration) is ready: when the configured database user is a
     * superuser, switch connections to the RLS role so the policies are enforced exactly as in production.
     */
    @Bean
    SmartInitializingSingleton rlsRoleActivator(DataSource dataSource) {
        return () -> {
            if (!(dataSource instanceof TenantAwareDataSource tenantAware)) {
                return;
            }
            JdbcTemplate jdbc = new JdbcTemplate(tenantAware.platformView());
            List<Boolean> superuser = jdbc.queryForList("SELECT rolsuper FROM pg_roles WHERE rolname = current_user", Boolean.class);
            Integer roleExists = jdbc.queryForObject("SELECT count(*) FROM pg_roles WHERE rolname = ?", Integer.class,
                    TenantAwareDataSource.RLS_ROLE);
            if (!superuser.isEmpty() && Boolean.TRUE.equals(superuser.getFirst()) && roleExists != null && roleExists > 0) {
                tenantAware.enableRlsRole();
                log.info("Database user is a superuser: connections switch to role {} so row-level security applies",
                        TenantAwareDataSource.RLS_ROLE);
            }
        };
    }
}
