package in.disasterlink.config;

import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.JdbcUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import java.util.List;

/**
 * Role-based access control for CITIZEN, ADMIN and SUPER_ADMIN.
 *
 * The reference deployment uses HTTP Basic + server-side sessions (cookies)
 * rather than JWTs so that admin tooling behaves like a browser application.
 * Production hardening still required: CSRF tokens, rate limiting and MFA.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Value("${disasterlink.cors.allowed-origins:http://localhost:3000}")
    private String allowedOrigin;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public UserDetailsService userDetailsService(DataSource dataSource) {
        JdbcUserDetailsManager manager = new JdbcUserDetailsManager(dataSource);
        manager.setUsersByUsernameQuery(
                "select email as username, password_hash as password, true as enabled from users where email = ?");
        manager.setAuthoritiesByUsernameQuery(
                "select email as username, role as authority from users where email = ?");
        return manager;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors(Customizer.withDefaults())
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/health", "/api/auth/**", "/api/warnings/public").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/districts/**", "/api/weather/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/incidents/**").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/incidents", "/api/sos").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/track/**", "/api/facilities/**").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/ai/classify").permitAll()
                .requestMatchers("/api/admin/**", "/api/governance/**").hasAnyRole("ADMIN", "SUPER_ADMIN")
                .requestMatchers("/api/governance/sources/**", "/api/simulation/**").hasRole("SUPER_ADMIN")
                .anyRequest().authenticated())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
            .httpBasic(Customizer.withDefaults())
            .formLogin(form -> form.disable());
        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(allowedOrigin.split(",")));
        config.setAllowedMethods(List.of("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Content-Type", "Authorization", "X-Requested-With"));
        config.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
