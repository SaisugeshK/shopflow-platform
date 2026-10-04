package com.shopflow.platform;

import com.shopflow.common.util.MobileNumbers;
import com.shopflow.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Makes sure every number in PLATFORM_SUPER_ADMIN_MOBILES is an active platform admin (§0B.5). Numbers are only
 * added or re-activated here; removing one from the list does not deactivate it (use the console for that).
 */
@Component
class PlatformAdminSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PlatformAdminSeeder.class);

    private final PlatformAdminRepository admins;
    private final AppProperties properties;

    PlatformAdminSeeder(PlatformAdminRepository admins, AppProperties properties) {
        this.admins = admins;
        this.properties = properties;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        for (String raw : properties.tenancy().superAdminMobiles()) {
            if (raw == null || raw.isBlank()) {
                continue;
            }
            String mobile = MobileNumbers.normalize(raw.trim());
            PlatformAdmin admin = admins.findByMobileNumber(mobile).orElseGet(() -> {
                PlatformAdmin a = new PlatformAdmin();
                a.setMobileNumber(mobile);
                a.setFullName("Super Admin");
                log.info("Seeded platform super admin {}", MobileNumbers.mask(mobile));
                return a;
            });
            admin.setStatus("ACTIVE");
            admins.save(admin);
        }
    }
}
