package in.disasterlink.domain;

import in.disasterlink.service.IntelligenceService;
import in.disasterlink.service.WeatherService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;

/**
 * REST controller for the DisasterLink modular monolith.
 *
 * NOTE: this class lives in the domain package so the condensed, review-friendly
 * entity layout (Entities.java / Repositories.java) remains package-private.
 * A production split would give each module its own public DTO + service +
 * controller package. The Next.js API in src/app/api is the integration-tested
 * reference implementation of this same contract.
 */
@RestController
@RequestMapping("/api")
public class ApiController {

    private final DistrictRepository districts;
    private final IncidentRepository incidents;
    private final SosRequestRepository sosRequests;
    private final FacilityRepository facilities;
    private final TeamRepository teams;
    private final AssignmentRepository assignments;
    private final AuditRepository auditLogs;
    private final WeatherService weatherService;
    private final IntelligenceService intelligence;

    public ApiController(DistrictRepository districts, IncidentRepository incidents, SosRequestRepository sosRequests,
                         FacilityRepository facilities, TeamRepository teams, AssignmentRepository assignments,
                         AuditRepository auditLogs, WeatherService weatherService, IntelligenceService intelligence) {
        this.districts = districts;
        this.incidents = incidents;
        this.sosRequests = sosRequests;
        this.facilities = facilities;
        this.teams = teams;
        this.assignments = assignments;
        this.auditLogs = auditLogs;
        this.weatherService = weatherService;
        this.intelligence = intelligence;
    }

    /* ------------------------------- DTOs ------------------------------- */

    public record IncidentRequest(
            @NotBlank String category,
            @NotBlank @Size(min = 15, max = 2000) String description,
            @NotBlank String districtCode,
            @NotBlank String locationName,
            @DecimalMin("7.8") @DecimalMax("14.0") Double lat,
            @DecimalMin("75.8") @DecimalMax("80.9") Double lng,
            @NotBlank String reportedSeverity,
            String contactName,
            @Pattern(regexp = "^$|^[0-9+\\s-]{6,20}$") String contactPhone) {}

    public record SosRequestPayload(
            @NotBlank String emergencyType,
            @NotBlank @Size(min = 10, max = 1500) String description,
            @NotBlank String districtCode,
            String locationName,
            @DecimalMin("7.8") @DecimalMax("14.0") Double lat,
            @DecimalMin("75.8") @DecimalMax("80.9") Double lng,
            String name,
            @Pattern(regexp = "^$|^[0-9+\\s-]{6,20}$") String phone,
            @Min(0) @Max(100000) Integer peopleAffected) {}

    public record FacilityPayload(
            @NotBlank String name,
            @NotBlank String category,
            @NotBlank String districtCode,
            String address,
            Double lat,
            Double lng,
            String phone,
            @NotBlank String sourceName,
            String sourceUrl,
            String verificationStatus,
            String availabilityNote,
            boolean officialShelter) {}

    public record ReviewRequest(@NotBlank String action, String note, String severity) {}

    public record AssignRequest(@NotNull Long teamId, String resourcesAllocated, String note) {}

    /* ----------------------------- helpers ------------------------------ */

    private ResponseEntity<Map<String, Object>> ok(Object data) {
        return ResponseEntity.ok(Map.of("ok", true, "data", data));
    }

    private District requireDistrict(String code) {
        return districts.findById(code.toUpperCase(Locale.ROOT))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Unknown district code"));
    }

    private static String actor(Authentication authentication) {
        return authentication == null ? "anonymous" : authentication.getName();
    }

    private static String role(Authentication authentication) {
        if (authentication == null) return "ANONYMOUS";
        return authentication.getAuthorities().stream()
                .map(Object::toString)
                .filter(a -> a.startsWith("ROLE_"))
                .map(a -> a.substring(5))
                .findFirst().orElse("CITIZEN");
    }

    private static Map<String, Object> incidentView(Incident incident, boolean admin) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("publicId", incident.publicId);
        view.put("category", incident.category);
        view.put("description", incident.description);
        view.put("districtCode", incident.districtCode);
        view.put("locationName", incident.locationName);
        view.put("status", incident.status);
        view.put("reportedSeverity", incident.reportedSeverity);
        view.put("assessedSeverity", incident.assessedSeverity);
        view.put("dataClass", incident.dataClass);
        view.put("createdAt", incident.createdAt);
        view.put("verifiedAt", incident.verifiedAt);
        view.put("resolvedAt", incident.resolvedAt);
        if (admin) {
            view.put("id", incident.id);
            view.put("lat", incident.lat);
            view.put("lng", incident.lng);
            view.put("contactName", incident.contactName);
            view.put("contactPhone", incident.contactPhone);
            view.put("aiCategory", incident.aiCategory);
            view.put("aiSeverity", incident.aiSeverity);
            view.put("aiSummary", incident.aiSummary);
            view.put("aiDuplicateOf", incident.aiDuplicateOf);
            view.put("resolutionNote", incident.resolutionNote);
        }
        return view;
    }

    private static String newPublicId(String prefix) {
        String stamp = java.time.LocalDate.now().toString().replace("-", "");
        return prefix + "-" + stamp + "-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase(Locale.ROOT);
    }

    /* ---------------------------- endpoints ----------------------------- */

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "service", "DisasterLink Java API",
                "incidents", incidents.count(), "districts", districts.count(), "time", Instant.now().toString());
    }

    @GetMapping("/districts")
    public ResponseEntity<Map<String, Object>> districtBoard() {
        List<Map<String, Object>> board = new ArrayList<>();
        for (District district : districts.findAllByOrderByNameAsc()) {
            WeatherService.DistrictWeather forecast = weatherService.fetch(district.code, district.lat, district.lng);
            List<Incident> districtIncidents = incidents.findByDistrictCodeOrderByCreatedAtDesc(district.code);
            List<Incident> recentWater = districtIncidents.stream()
                    .filter(i -> List.of("FLOODING", "WATERLOGGING").contains(i.category))
                    .filter(i -> i.createdAt.isAfter(OffsetDateTime.now(ZoneOffset.UTC).minusHours(48)))
                    .collect(Collectors.toList());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("code", district.code);
            row.put("name", district.name);
            row.put("region", district.region);
            row.put("lat", district.lat);
            row.put("lng", district.lng);
            row.put("weather", forecast.snapshot());
            row.put("weatherStale", forecast.stale());
            row.put("incidents", Map.of(
                    "total", districtIncidents.size(),
                    "pending", districtIncidents.stream().filter(i -> List.of("PENDING", "UNDER_REVIEW").contains(i.status)).count(),
                    "verified", districtIncidents.stream().filter(i -> "VERIFIED".equals(i.status)).count()));
            row.put("openSos", sosRequests.findAllByOrderByCreatedAtDesc().stream()
                    .filter(s -> s.districtCode.equals(district.code) && !"RESOLVED".equals(s.status)).count());
            row.put("facilities", facilities.findByDistrictCodeAndActiveTrue(district.code).size());
            row.put("risk", intelligence.assessFloodRisk(district.name, district.region, district.lat, district.lng,
                    forecast.snapshot(), recentWater));
            board.add(row);
        }
        return ok(Map.of("districts", board, "count", board.size(),
                "riskSourceClass", "MODEL_RISK_ESTIMATE",
                "note", "Weather from Open-Meteo. No official warning is ingested in this module."));
    }

    @GetMapping("/districts/{code}")
    public ResponseEntity<Map<String, Object>> district(@PathVariable String code) {
        District district = requireDistrict(code);
        WeatherService.DistrictWeather forecast = weatherService.fetch(district.code, district.lat, district.lng);
        List<Incident> districtIncidents = incidents.findByDistrictCodeOrderByCreatedAtDesc(district.code);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("district", district);
        data.put("weather", forecast.snapshot());
        data.put("risk", intelligence.assessFloodRisk(district.name, district.region, district.lat, district.lng,
                forecast.snapshot(), districtIncidents));
        data.put("incidents", districtIncidents.stream()
                .filter(i -> List.of("VERIFIED", "RESOLVED").contains(i.status))
                .map(i -> incidentView(i, false)).collect(Collectors.toList()));
        data.put("facilities", facilities.findByDistrictCodeAndActiveTrue(district.code));
        data.put("officialWarnings", List.of());
        data.put("warningNote", "Official IMD/TNSDMA warning ingestion is not configured; no warnings are fabricated.");
        return ok(data);
    }

    @GetMapping("/incidents")
    public ResponseEntity<Map<String, Object>> publicIncidents(@RequestParam(required = false) String district) {
        List<Incident> rows = incidents.findTop200ByOrderByCreatedAtDesc().stream()
                .filter(i -> List.of("VERIFIED", "RESOLVED").contains(i.status))
                .filter(i -> district == null || i.districtCode.equalsIgnoreCase(district))
                .toList();
        return ok(Map.of("incidents", rows.stream().map(i -> incidentView(i, false)).toList(),
                "note", "Only administrator-verified reports are published."));
    }

    @PostMapping("/incidents")
    public ResponseEntity<Map<String, Object>> reportIncident(@Valid @RequestBody IncidentRequest request) {
        requireDistrict(request.districtCode());
        IntelligenceService.IncidentAnalysis analysis =
                intelligence.analyse(request.description(), request.reportedSeverity());

        Incident incident = new Incident();
        incident.publicId = newPublicId("INC");
        incident.category = request.category().toUpperCase(Locale.ROOT);
        incident.description = request.description();
        incident.districtCode = request.districtCode().toUpperCase(Locale.ROOT);
        incident.locationName = request.locationName();
        incident.lat = request.lat();
        incident.lng = request.lng();
        incident.reportedSeverity = request.reportedSeverity().toUpperCase(Locale.ROOT);
        incident.status = "PENDING";
        incident.contactName = request.contactName();
        incident.contactPhone = request.contactPhone();
        incident.dataClass = "COMMUNITY_REPORT";
        incident.aiCategory = analysis.category();
        incident.aiSeverity = analysis.severity();
        incident.aiSummary = analysis.summary();
        incident.aiDuplicateOf = analysis.duplicatePublicId();
        incident.aiConfidence = analysis.confidence();
        incident.createdAt = OffsetDateTime.now(ZoneOffset.UTC);
        incident.updatedAt = incident.createdAt;
        incidents.save(incident);
        intelligence.audit("Citizen reporter", "CITIZEN", null, "INCIDENT_CREATED", "INCIDENT",
                incident.publicId, "Citizen report submitted and queued for administrator review");
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("ok", true, "data", Map.of("incident", incidentView(incident, false), "analysis", analysis)));
    }

    @GetMapping("/admin/incidents")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> adminIncidents(@RequestParam(required = false) String status) {
        List<Incident> rows = status == null
                ? incidents.findTop200ByOrderByCreatedAtDesc()
                : incidents.findByStatusOrderByCreatedAtDesc(status.toUpperCase(Locale.ROOT));
        return ok(Map.of("incidents", rows.stream().map(i -> incidentView(i, true)).toList()));
    }

    @PatchMapping("/admin/incidents/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> reviewIncident(@PathVariable Long id,
                                                              @Valid @RequestBody ReviewRequest request,
                                                              Authentication authentication) {
        Incident incident = incidents.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Incident not found"));
        String action = request.action().toUpperCase(Locale.ROOT);
        switch (action) {
            case "START_REVIEW" -> incident.status = "UNDER_REVIEW";
            case "VERIFY" -> {
                incident.status = "VERIFIED";
                incident.assessedSeverity = request.severity() != null ? request.severity().toUpperCase(Locale.ROOT)
                        : Optional.ofNullable(incident.aiSeverity).orElse(incident.reportedSeverity);
                incident.verifiedAt = OffsetDateTime.now(ZoneOffset.UTC);
            }
            case "REJECT" -> {
                if (request.note() == null || request.note().isBlank()) {
                    throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "A rejection reason is required");
                }
                incident.status = "REJECTED";
                incident.resolutionNote = request.note();
            }
            case "RESOLVE" -> {
                if (request.note() == null || request.note().isBlank()) {
                    throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Resolution details are required");
                }
                if (!"VERIFIED".equals(incident.status)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Only verified incidents can be resolved");
                }
                incident.status = "RESOLVED";
                incident.resolutionNote = request.note();
                incident.resolvedAt = OffsetDateTime.now(ZoneOffset.UTC);
            }
            case "SET_SEVERITY" -> {
                if (request.severity() == null) {
                    throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Severity is required");
                }
                incident.assessedSeverity = request.severity().toUpperCase(Locale.ROOT);
            }
            default -> throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Unsupported action");
        }
        incident.updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
        incidents.save(incident);
        intelligence.audit(actor(authentication), role(authentication), null, "INCIDENT_" + action,
                "INCIDENT", incident.publicId, "Incident " + incident.publicId + " updated: " + action);
        return ok(Map.of("incident", incidentView(incident, true)));
    }

    @GetMapping("/sos")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> sosQueue() {
        return ok(Map.of("sos", sosRequests.findAllByOrderByCreatedAtDesc(),
                "teams", teams.findAll(),
                "note", "Teams are SIMULATED demonstration records. Assignment never triggers a real dispatch."));
    }

    @PostMapping("/sos")
    public ResponseEntity<Map<String, Object>> createSos(@Valid @RequestBody SosRequestPayload request) {
        requireDistrict(request.districtCode());
        IntelligenceService.IncidentAnalysis triage = intelligence.analyse(request.description(), "MODERATE");
        SosRequest sos = new SosRequest();
        sos.publicId = newPublicId("SOS");
        sos.emergencyType = request.emergencyType().toUpperCase(Locale.ROOT);
        sos.description = request.description();
        sos.districtCode = request.districtCode().toUpperCase(Locale.ROOT);
        sos.locationName = request.locationName();
        sos.lat = request.lat();
        sos.lng = request.lng();
        sos.name = request.name();
        sos.phone = request.phone();
        sos.peopleAffected = request.peopleAffected();
        sos.status = "SUBMITTED";
        sos.priority = switch (triage.severity()) {
            case "CRITICAL" -> "CRITICAL";
            case "HIGH" -> "HIGH";
            case "LOW" -> "LOW";
            default -> "NORMAL";
        };
        sos.createdAt = OffsetDateTime.now(ZoneOffset.UTC);
        sos.updatedAt = sos.createdAt;
        sosRequests.save(sos);
        intelligence.audit("Citizen", "CITIZEN", null, "SOS_CREATED", "SOS", sos.publicId,
                "SOS request submitted; no dispatch has occurred");
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("ok", true,
                "data", Map.of("sos", Map.of("publicId", sos.publicId, "status", sos.status, "priority", sos.priority),
                        "disclaimer", "Submitting an SOS does not guarantee that a rescue team has been dispatched. Call 112 / 108 / 101 directly in a life-threatening emergency.")));
    }

    @PatchMapping("/admin/sos/{id}/assign")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> assignTeam(@PathVariable Long id,
                                                          @Valid @RequestBody AssignRequest request,
                                                          Authentication authentication) {
        SosRequest sos = sosRequests.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "SOS not found"));
        ResponseTeam team = teams.findById(request.teamId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Team not found"));
        if ("OFF_DUTY".equals(team.status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Team is off duty");
        }
        sos.assignedTeamId = team.id;
        sos.assignedTeamName = team.name;
        sos.status = "TEAM_ASSIGNED";
        sos.updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
        team.status = "ASSIGNED";
        teams.save(team);

        Assignment assignment = new Assignment();
        assignment.teamId = team.id;
        assignment.teamName = team.name;
        assignment.sosId = sos.id;
        assignment.resourcesAllocated = request.resourcesAllocated();
        assignment.notes = request.note();
        assignment.status = "ASSIGNED";
        assignment.assignedByName = actor(authentication);
        assignment.createdAt = OffsetDateTime.now(ZoneOffset.UTC);
        assignment.updatedAt = assignment.createdAt;
        assignment.dataClass = sos.dataClass;
        assignments.save(assignment);

        intelligence.audit(actor(authentication), role(authentication), null, "SOS_TEAM_ASSIGNED", "SOS",
                sos.publicId, "Team " + team.name + " assigned to SOS request");
        return ok(Map.of("sos", sos, "assignment", assignment));
    }

    @PatchMapping("/admin/assignments/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> updateAssignment(@PathVariable Long id,
                                                               @RequestParam String status,
                                                               Authentication authentication) {
        Assignment assignment = assignments.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Assignment not found"));
        List<String> allowed = List.of("ASSIGNED", "EN_ROUTE", "ON_SITE", "COMPLETED", "CANCELLED");
        if (!allowed.contains(status)) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Invalid assignment status");
        }
        assignment.status = status;
        assignment.updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
        assignments.save(assignment);
        if (List.of("COMPLETED", "CANCELLED").contains(status)) {
            teams.findById(assignment.teamId).ifPresent(team -> {
                team.status = "AVAILABLE";
                teams.save(team);
            });
        }
        intelligence.audit(actor(authentication), role(authentication), null, "ASSIGNMENT_UPDATED",
                "ASSIGNMENT", String.valueOf(assignment.id), "Assignment status set to " + status);
        return ok(Map.of("assignment", assignment));
    }

    @GetMapping("/facilities")
    public ResponseEntity<Map<String, Object>> facilityDirectory(@RequestParam(required = false) String district,
                                                                @RequestParam(required = false) String category) {
        List<Facility> rows = district == null ? facilities.findByActiveTrue() : facilities.findByDistrictCodeAndActiveTrue(district);
        List<Facility> filtered = category == null ? rows
                : rows.stream().filter(f -> f.category.equalsIgnoreCase(category)).toList();
        return ok(Map.of("facilities", filtered,
                "disclosure", "Directory candidates only. Bed, medicine and stock availability are never asserted."));
    }

    @PostMapping("/admin/facilities")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> createFacility(@Valid @RequestBody FacilityPayload payload,
                                                              Authentication authentication) {
        requireDistrict(payload.districtCode());
        if (payload.officialShelter() && (payload.sourceUrl() == null || payload.sourceUrl().isBlank())) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "An official shelter requires a source URL supporting the designation");
        }
        Facility facility = new Facility();
        facility.name = payload.name();
        facility.category = payload.category().toUpperCase(Locale.ROOT);
        facility.districtCode = payload.districtCode().toUpperCase(Locale.ROOT);
        facility.address = payload.address();
        facility.lat = payload.lat();
        facility.lng = payload.lng();
        facility.phone = payload.phone();
        facility.sourceName = payload.sourceName();
        facility.sourceUrl = payload.sourceUrl();
        facility.verificationStatus = payload.verificationStatus() == null ? "CANDIDATE" : payload.verificationStatus();
        facility.availabilityNote = payload.availabilityNote();
        facility.availabilityConfirmedAt = payload.availabilityNote() == null ? null : OffsetDateTime.now(ZoneOffset.UTC);
        facility.officialShelter = payload.officialShelter();
        facility.createdAt = OffsetDateTime.now(ZoneOffset.UTC);
        facility.updatedAt = facility.createdAt;
        facilities.save(facility);
        intelligence.audit(actor(authentication), role(authentication), null, "FACILITY_CREATED", "FACILITY",
                String.valueOf(facility.id), "Facility created: " + facility.name);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("ok", true, "data", facility));
    }

    @GetMapping("/track/{type}/{publicId}")
    public ResponseEntity<Map<String, Object>> track(@PathVariable String type, @PathVariable String publicId) {
        if ("INCIDENT".equalsIgnoreCase(type)) {
            Incident incident = incidents.findByPublicId(publicId.toUpperCase(Locale.ROOT))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Record not found"));
            return ok(Map.of("kind", "INCIDENT", "record", incidentView(incident, false),
                    "contactPhoneMasked", mask(incident.contactPhone),
                    "note", "Citizen reports are not verified automatically."));
        }
        SosRequest sos = sosRequests.findByPublicId(publicId.toUpperCase(Locale.ROOT))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Record not found"));
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("publicId", sos.publicId);
        view.put("status", sos.status);
        view.put("priority", sos.priority);
        view.put("emergencyType", sos.emergencyType);
        view.put("districtCode", sos.districtCode);
        view.put("locationName", sos.locationName);
        view.put("createdAt", sos.createdAt);
        view.put("assignedTeamName", sos.assignedTeamName);
        view.put("resolutionNote", sos.resolutionNote);
        view.put("phoneMasked", mask(sos.phone));
        return ok(Map.of("kind", "SOS", "record", view,
                "note", "An SOS submission does not guarantee dispatch. Call 112 / 108 / 101 in a life-threatening emergency."));
    }

    @GetMapping("/admin/analytics")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> analytics() {
        List<Incident> rows = incidents.findAll();
        Map<String, Long> byCategory = rows.stream().collect(Collectors.groupingBy(i -> i.category, Collectors.counting()));
        Map<String, Long> byStatus = rows.stream().collect(Collectors.groupingBy(i -> i.status, Collectors.counting()));
        Map<String, Long> bySeverity = rows.stream()
                .collect(Collectors.groupingBy(i -> Optional.ofNullable(i.assessedSeverity).orElse(i.reportedSeverity), Collectors.counting()));
        return ok(Map.of("byCategory", byCategory, "byStatus", byStatus, "bySeverity", bySeverity,
                "sosTotal", sosRequests.count(), "facilities", facilities.count(),
                "note", "Counts include SIMULATED demonstration records."));
    }

    @GetMapping("/governance/audit")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> auditTrail() {
        return ok(Map.of("audit", auditLogs.findTop200ByOrderByCreatedAtDesc()));
    }

    private static String mask(String phone) {
        if (phone == null || phone.length() < 4) return "Not provided";
        return "•".repeat(Math.max(0, phone.replaceAll("\\D", "").length() - 4))
                + phone.replaceAll("\\D", "").substring(Math.max(0, phone.replaceAll("\\D", "").length() - 4));
    }
}
