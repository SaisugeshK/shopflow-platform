package com.shopflow.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * Repositories are grouped per module as nested interfaces (e.g. {@code CustomerRepositories.CustomerRepository}),
 * so nested repository scanning is enabled.
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(basePackages = "com.shopflow", considerNestedRepositories = true)
public class PersistenceConfig {
}
