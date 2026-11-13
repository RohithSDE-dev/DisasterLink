package in.disasterlink.service;

import in.disasterlink.domain.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Explainable flood-risk heuristic and AI incident-intelligence helpers,
 * mirroring src/lib/risk.ts and src/lib/ai.ts in the tested TypeScript API.
 *
 * Both are MODEL_RISK_ESTIMATE outputs: never official warnings, never an
 * incident verification and never a dispatch instruction.
 */
@Service
public class IntelligenceService {

    public record RiskFactor(String id, String label, String detail, int points, String sourceClass) {}
    public record RiskAssessment(
            String level, int score, List<RiskFactor> factors, String explanation,
            String sourceClass, String model, String confidence, String disclaimer) {}

    public record IncidentAnalysis(
            String category, int confidence, String severity, List<String> severityRationale,
            String summary, String duplicatePublicId, List<String> suggestedActions, String advisory) {}

    @PersistenceContext
    private EntityManager entityManager;

    private static final String DISCLAIMER =
            "MODEL_RISK_ESTIMATE produced by a transparent heuristic. Not an official flood-prone-zone "
            + "determination and not a substitute for IMD or TNSDMA warnings.";

    public RiskAssessment assessFloodRisk(String districtName, String region, double lat, double lng,
                                          WeatherService.WeatherSnapshot weather, List<?> recentIncidents) {
        List<RiskFactor> factors = new ArrayList<>();
        int score = 0;

        Double rain = weather != null && weather.available() ? weather.next24hRainfall() : null;
        int rainPoints = rain == null ? 0 : rain >= 60 ? 34 : rain >= 30 ? 24 : rain >= 10 ? 14 : rain >= 2 ? 6 : 0;
        factors.add(new RiskFactor("forecast_rainfall",
                rain == null ? "Forecast rainfall unavailable" : "Forecast rainfall next 24h: " + rain + " mm",
                "Open-Meteo forecast accumulation (FORECAST).", rainPoints, "FORECAST"));
        score += rainPoints;

        long reports = recentIncidents == null ? 0 : recentIncidents.size();
        int reportPoints = (int) Math.min(30, reports * 9);
        factors.add(new RiskFactor("community_reports",
                reports + " recent flood/waterlogging report(s) in the last 48h",
                "Weighted community reports; unverified reports contribute fewer points.", reportPoints, "COMMUNITY_REPORT"));
        score += reportPoints;

        int terrain = "Delta".equalsIgnoreCase(region) ? 10 : 4;
        factors.add(new RiskFactor("terrain_prior",
                "Geographic heuristic for " + region + " region",
                "Transparent terrain prior; not a government hazard assessment.", terrain, "MODEL_RISK_ESTIMATE"));
        score += terrain;

        String level = score >= 62 ? "VERY_HIGH" : score >= 40 ? "HIGH" : score >= 20 ? "MODERATE" : "LOW";
        String explanation = "Score " + score + "/100 for " + districtName + ": "
                + factors.stream().filter(f -> f.points() > 0)
                    .sorted(Comparator.comparingInt(RiskFactor::points).reversed())
                    .limit(3)
                    .map(f -> f.label() + " (+" + f.points() + ")")
                    .collect(Collectors.joining("; "));
        return new RiskAssessment(level, score, factors, explanation, "MODEL_RISK_ESTIMATE",
                "DisasterLink Flood Risk Heuristic v1", weather != null && weather.available() ? "MEDIUM" : "LOW",
                DISCLAIMER);
    }

    private static final Map<String, List<String>> CATEGORY_KEYWORDS = Map.of(
            "FLOODING", List.of("flood", "inundated", "river overflow", "swept away", "water entered"),
            "WATERLOGGING", List.of("waterlog", "stagnant", "logging", "ankle deep", "knee deep", "drain"),
            "FALLEN_TREE", List.of("tree fell", "uprooted", "tree collapsed", "branch fell"),
            "ROAD_BLOCKAGE", List.of("blocked", "blockage", "debris", "road closed", "boulder"),
            "BUILDING_DAMAGE", List.of("wall collapsed", "roof collapsed", "structural damage", "crack"),
            "FIRE", List.of("fire", "smoke", "short circuit", "blast", "flames"),
            "LANDSLIDE", List.of("landslide", "mudslide", "rockfall", "slope failure"),
            "OTHER", List.of("power cut", "live wire", "gas leak")
    );

    public IncidentAnalysis analyse(String description, String reportedSeverity) {
        String text = description == null ? "" : description.toLowerCase(Locale.ROOT);
        String best = "OTHER";
        int bestScore = 0;
        List<String> matched = new ArrayList<>();
        for (Map.Entry<String, List<String>> entry : CATEGORY_KEYWORDS.entrySet()) {
            int score = 0;
            for (String keyword : entry.getValue()) {
                if (text.contains(keyword)) {
                    score += 5;
                    matched.add(keyword);
                }
            }
            if (score > bestScore) {
                bestScore = score;
                best = entry.getKey();
            }
        }
        int confidence = bestScore == 0 ? 25 : Math.min(95, 55 + bestScore * 4);

        List<String> rationale = new ArrayList<>();
        String severity = reportedSeverity == null ? "MODERATE" : reportedSeverity;
        List<String> criticalTerms = List.of("trapped", "stranded", "missing", "casualt", "death", "rescue", "swept away");
        List<String> highTerms = List.of("rising water", "waist deep", "evacuat", "injur", "hospital", "school");
        if (criticalTerms.stream().anyMatch(text::contains)) {
            severity = "CRITICAL";
            rationale.add("Critical signal phrase detected in the description.");
        } else if (highTerms.stream().anyMatch(text::contains)) {
            severity = "HIGH";
            rationale.add("High-severity signal phrase detected (rising water, injury or sensitive facility).");
        } else {
            rationale.add("No escalation phrase detected; administrator must confirm severity.");
        }

        String summary = description == null || description.isBlank()
                ? ""
                : description.length() <= 280 ? description : description.substring(0, 280) + " …";

        String duplicate = null;
        if (!matched.isEmpty()) {
            duplicate = entityManager.createQuery(
                            "select i.publicId from Incident i where i.status <> 'REJECTED' "
                                    + "and lower(i.description) like :needle order by i.createdAt desc", String.class)
                    .setParameter("needle", "%" + matched.get(0) + "%")
                    .setMaxResults(1)
                    .getResultList().stream().findFirst().orElse(null);
        }

        return new IncidentAnalysis(best, confidence, severity, rationale, summary, duplicate,
                List.of("Confirm access and water depth", "Check nearby verified reports for duplication",
                        "Record findings before changing status"),
                "AI suggestion for human review only. It does not verify the incident, issue an official alert or dispatch a team.");
    }

    public void audit(String actorName, String actorRole, Long actorId, String action,
                      String entityType, String entityId, String summary) {
        AuditLog log = new AuditLog();
        log.actorId = actorId;
        log.actorName = actorName == null ? "System" : actorName;
        log.actorRole = actorRole == null ? "SYSTEM" : actorRole;
        log.action = action;
        log.entityType = entityType;
        log.entityId = entityId;
        log.summary = summary;
        log.details = "{}";
        log.createdAt = Instant.now().atOffset(java.time.ZoneOffset.UTC);
        entityManager.persist(log);
    }
}
