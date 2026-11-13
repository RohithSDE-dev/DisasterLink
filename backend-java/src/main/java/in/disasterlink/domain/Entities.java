package in.disasterlink.domain;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

/**
 * JPA entities mirroring the PostgreSQL schema used by the Next.js API layer.
 * Kept in one file for review convenience; split per module in production.
 * Field access is used so no boilerplate getters are required.
 */
@Entity
@Table(name = "users")
class AppUser {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @Column(nullable = false)
    public String name;
    @Column(nullable = false, unique = true)
    public String email;
    @Column(name = "password_hash", nullable = false)
    public String passwordHash;
    @Column(nullable = false)
    public String role = "CITIZEN";
    public String phone;
    @Column(name = "district_code")
    public String districtCode;
    @Column(name = "created_at")
    public OffsetDateTime createdAt = OffsetDateTime.now();
}

@Entity
@Table(name = "districts")
class District {
    @Id
    public String code;
    @Column(nullable = false)
    public String name;
    public String region;
    public Double lat;
    public Double lng;
    @Column(name = "boundary_source")
    public String boundarySource;
    @Column(name = "has_polygon")
    public boolean hasPolygon;
}

@Entity
@Table(name = "incidents")
class Incident {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @Column(name = "public_id", nullable = false, unique = true)
    public String publicId;
    @Column(nullable = false)
    public String category;
    @Column(nullable = false, length = 4000)
    public String description;
    @Column(name = "district_code", nullable = false)
    public String districtCode;
    @Column(name = "location_name", nullable = false)
    public String locationName;
    public Double lat;
    public Double lng;
    @Column(name = "reported_severity", nullable = false)
    public String reportedSeverity = "MODERATE";
    @Column(name = "assessed_severity")
    public String assessedSeverity;
    @Column(nullable = false)
    public String status = "PENDING";
    @Column(name = "contact_name")
    public String contactName;
    @Column(name = "contact_phone")
    public String contactPhone;
    @Column(name = "photo_url")
    public String photoUrl;
    @Column(name = "data_class", nullable = false)
    public String dataClass = "COMMUNITY_REPORT";
    @Column(name = "ai_category")
    public String aiCategory;
    @Column(name = "ai_severity")
    public String aiSeverity;
    @Column(name = "ai_summary", length = 1200)
    public String aiSummary;
    @Column(name = "ai_duplicate_of")
    public String aiDuplicateOf;
    @Column(name = "ai_confidence")
    public Integer aiConfidence;
    @Column(name = "resolution_note", length = 1200)
    public String resolutionNote;
    @Column(name = "created_at")
    public OffsetDateTime createdAt = OffsetDateTime.now();
    @Column(name = "updated_at")
    public OffsetDateTime updatedAt = OffsetDateTime.now();
    @Column(name = "verified_at")
    public OffsetDateTime verifiedAt;
    @Column(name = "resolved_at")
    public OffsetDateTime resolvedAt;
}

@Entity
@Table(name = "sos_requests")
class SosRequest {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @Column(name = "public_id", nullable = false, unique = true)
    public String publicId;
    @Column(name = "emergency_type", nullable = false)
    public String emergencyType = "OTHER";
    @Column(nullable = false, length = 2000)
    public String description;
    @Column(name = "district_code", nullable = false)
    public String districtCode;
    @Column(name = "location_name")
    public String locationName;
    public Double lat;
    public Double lng;
    public String name;
    public String phone;
    @Column(name = "people_affected")
    public Integer peopleAffected;
    @Column(nullable = false)
    public String status = "SUBMITTED";
    @Column(nullable = false)
    public String priority = "NORMAL";
    @Column(name = "assigned_team_id")
    public Long assignedTeamId;
    @Column(name = "assigned_team_name")
    public String assignedTeamName;
    @Column(name = "resolution_note", length = 1500)
    public String resolutionNote;
    @Column(name = "data_class", nullable = false)
    public String dataClass = "COMMUNITY_REPORT";
    @Column(name = "created_at")
    public OffsetDateTime createdAt = OffsetDateTime.now();
    @Column(name = "updated_at")
    public OffsetDateTime updatedAt = OffsetDateTime.now();
    @Column(name = "resolved_at")
    public OffsetDateTime resolvedAt;
}

@Entity
@Table(name = "facilities")
class Facility {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @Column(nullable = false)
    public String name;
    @Column(nullable = false)
    public String category;
    @Column(name = "district_code", nullable = false)
    public String districtCode;
    public String address;
    public Double lat;
    public Double lng;
    public String phone;
    @Column(name = "source_name")
    public String sourceName;
    @Column(name = "source_url")
    public String sourceUrl;
    @Column(name = "source_class", nullable = false)
    public String sourceClass = "COMMUNITY_REPORT";
    @Column(name = "verification_status", nullable = false)
    public String verificationStatus = "CANDIDATE";
    @Column(name = "availability_note", length = 600)
    public String availabilityNote;
    @Column(name = "availability_confirmed_at")
    public OffsetDateTime availabilityConfirmedAt;
    @Column(name = "is_active", nullable = false)
    public boolean active = true;
    @Column(name = "is_official_shelter", nullable = false)
    public boolean officialShelter = false;
    @Column(name = "shelter_designation")
    public String shelterDesignation;
    @Column(name = "data_class", nullable = false)
    public String dataClass = "CANDIDATE";
    @Column(name = "created_at")
    public OffsetDateTime createdAt = OffsetDateTime.now();
    @Column(name = "updated_at")
    public OffsetDateTime updatedAt = OffsetDateTime.now();
}

@Entity
@Table(name = "teams")
class ResponseTeam {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @Column(nullable = false)
    public String name;
    @Column(nullable = false)
    public String type;
    @Column(name = "base_district", nullable = false)
    public String baseDistrict;
    public String contact;
    @Column(name = "member_count", nullable = false)
    public Integer memberCount = 0;
    @Column(nullable = false)
    public String status = "AVAILABLE";
    public String notes;
    @Column(name = "data_class", nullable = false)
    public String dataClass = "SIMULATED";
}

@Entity
@Table(name = "assignments")
class Assignment {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @Column(name = "team_id", nullable = false)
    public Long teamId;
    @Column(name = "team_name", nullable = false)
    public String teamName;
    @Column(name = "incident_id")
    public Long incidentId;
    @Column(name = "sos_id")
    public Long sosId;
    @Column(name = "resources_allocated")
    public String resourcesAllocated;
    @Column(nullable = false)
    public String status = "ASSIGNED";
    public String notes;
    @Column(name = "assigned_by_id")
    public Long assignedById;
    @Column(name = "assigned_by_name")
    public String assignedByName;
    @Column(name = "data_class", nullable = false)
    public String dataClass = "SIMULATED";
    @Column(name = "created_at")
    public OffsetDateTime createdAt = OffsetDateTime.now();
    @Column(name = "updated_at")
    public OffsetDateTime updatedAt = OffsetDateTime.now();
}

@Entity
@Table(name = "audit_logs")
class AuditLog {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @Column(name = "actor_id")
    public Long actorId;
    @Column(name = "actor_name")
    public String actorName;
    @Column(name = "actor_role")
    public String actorRole;
    @Column(nullable = false)
    public String action;
    @Column(name = "entity_type", nullable = false)
    public String entityType;
    @Column(name = "entity_id")
    public String entityId;
    @Column(nullable = false, length = 1500)
    public String summary;
    @Column(columnDefinition = "jsonb")
    public String details;
    @Column(name = "created_at")
    public OffsetDateTime createdAt = OffsetDateTime.now();
}
