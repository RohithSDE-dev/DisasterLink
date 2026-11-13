package in.disasterlink.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

/** Spring Data repositories for the DisasterLink modular monolith. */
interface DistrictRepository extends JpaRepository<District, String> {
    List<District> findAllByOrderByNameAsc();
}

interface IncidentRepository extends JpaRepository<Incident, Long> {
    Optional<Incident> findByPublicId(String publicId);
    List<Incident> findByDistrictCodeOrderByCreatedAtDesc(String districtCode);
    List<Incident> findByStatusOrderByCreatedAtDesc(String status);
    List<Incident> findTop200ByOrderByCreatedAtDesc();
}

interface SosRequestRepository extends JpaRepository<SosRequest, Long> {
    Optional<SosRequest> findByPublicId(String publicId);
    List<SosRequest> findAllByOrderByCreatedAtDesc();
}

interface FacilityRepository extends JpaRepository<Facility, Long> {
    List<Facility> findByDistrictCodeAndActiveTrue(String districtCode);
    List<Facility> findByActiveTrue();
}

interface TeamRepository extends JpaRepository<ResponseTeam, Long> {
    List<ResponseTeam> findByStatus(String status);
}

interface AssignmentRepository extends JpaRepository<Assignment, Long> {
    List<Assignment> findBySosId(Long sosId);
    List<Assignment> findAllByOrderByCreatedAtDesc();
}

interface AuditRepository extends JpaRepository<AuditLog, Long> {
    List<AuditLog> findTop200ByOrderByCreatedAtDesc();
}
