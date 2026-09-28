package com.shopflow.common.web;

import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.function.Supplier;

/**
 * Runs response mapping inside a read-only transaction. Open-session-in-view is disabled, so controllers that map
 * lazy collections (order items, invoice lines) do it through this helper after the write transaction commits.
 */
@Component
public class ReadTx {

    private final TransactionTemplate tx;

    public ReadTx(PlatformTransactionManager txManager) {
        this.tx = new TransactionTemplate(txManager);
        this.tx.setReadOnly(true);
    }

    public <T> T call(Supplier<T> work) {
        return tx.execute(status -> work.get());
    }
}
