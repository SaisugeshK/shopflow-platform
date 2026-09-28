package com.shopflow.common.jobs;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Queue abstraction for asynchronous work (§73). The in-process implementation runs jobs on virtual threads after
 * the current transaction commits. Jobs must be idempotent and their state must live in the database (e.g.
 * whatsapp_messages) so a scheduled sweeper can resume anything lost on restart. Swap this class for a broker-backed
 * implementation without touching callers.
 */
@Component
public class BackgroundJobs implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(BackgroundJobs.class);
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public void afterCommit(String name, Runnable job) {
        Map<String, String> mdc = MDC.getCopyOfContextMap();
        Runnable wrapped = () -> {
            if (mdc != null) {
                MDC.setContextMap(mdc);
            }
            try {
                job.run();
            } catch (RuntimeException e) {
                log.error("Background job {} failed", name, e);
            } finally {
                MDC.clear();
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    executor.submit(wrapped);
                }
            });
        } else {
            executor.submit(wrapped);
        }
    }

    @Override
    public void close() {
        executor.shutdown();
    }
}
