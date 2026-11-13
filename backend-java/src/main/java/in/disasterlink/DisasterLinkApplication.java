package in.disasterlink;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * DisasterLink API — modular monolith.
 *
 * Modules: authentication/users, districts & geography, incidents, SOS,
 * emergency facilities, shelters, resources, response teams, assignments,
 * weather, flood intelligence, analytics, audit logs.
 *
 * The platform is a decision-support prototype: it never issues official
 * warnings, never verifies citizen reports automatically and never dispatches
 * emergency services.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class DisasterLinkApplication {
    public static void main(String[] args) {
        SpringApplication.run(DisasterLinkApplication.class, args);
    }
}
