
const SUPABASE_URL = "https://wpzecjwjbzjwduviksri.supabase.co";
const SUPABASE_KEY = "sb_publishable_dWXwENqpokifN2DCBX4y-g_BCv7W9CI";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const BUCKET_NAME = "scholarship-requirements";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentRole = "student";
let scholarships = [];
let submissions = [];

function showMessage(id, message, type = "") {
    const element = $(id);
    if (!element) return;

    element.textContent = message;
    element.className = "message";

    if (type) element.classList.add(type);
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => {
        const replacements = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return replacements[character];
    });
}

function money(value) {
    return Number(value || 0).toLocaleString("en-PH", {
        style: "currency",
        currency: "PHP"
    });
}

function statusClass(status) {
    const value = String(status || "").toLowerCase();

    if (["compliant", "verified", "approved"].includes(value)) {
        return "status-compliant";
    }

    if (["with deficiency", "rejected"].includes(value)) {
        return "status-deficiency";
    }

    return "status-pending";
}

function statusBadge(status) {
    return `<span class="status-badge ${statusClass(status)}">${escapeHTML(status || "Pending")}</span>`;
}

function isStaff() {
    return currentRole === "staff";
}

function isAdmin() {
    return false;
}

function getRoleLabel(role) {
    return role === "staff" ? "Staff" : "Scholar";
}

function showLogin() {
    $("loginPanel").classList.remove("hidden");
    $("app").classList.add("hidden");

    $("loginPanel").style.display = "flex";
    $("app").style.display = "none";
}

function showApp() {
    $("loginPanel").classList.add("hidden");
    $("app").classList.remove("hidden");

    $("loginPanel").style.display = "none";
    $("app").style.display = "flex";
}

function showPage(pageId) {
    document.querySelectorAll(".page").forEach((page) => {
        page.classList.add("hidden");
    });

    const selectedPage = $(pageId);
    if (selectedPage) selectedPage.classList.remove("hidden");

    document.querySelectorAll(".nav-button").forEach((button) => {
        button.classList.toggle("active", button.dataset.page === pageId);
    });

    const headings = {
        dashboardPage: "Dashboard",
        scholarshipsPage: "Scholarships",
        submissionsPage: "Semester Submissions"
    };

    $("pageHeading").textContent = headings[pageId] || "Dashboard";
}

async function getUserRole(user) {
    const { data, error } = await db
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .maybeSingle();

    if (error) {
        console.error("Profile lookup failed:", error);
        return { role: "student", name: user.email || "User" };
    }

    return {
        role: data?.role || "student",
        name: data?.full_name || user.email || "User"
    };
}

async function enterApp(user) {
    currentUser = user;

    const profile = await getUserRole(user);
    currentRole = profile.role;

    $("userEmail").textContent = user.email || profile.name;
    $("userRole").textContent = `Role: ${getRoleLabel(currentRole)}`;

    $("toggleScholarshipForm").classList.toggle("hidden", !isStaff());
    $("scholarshipFormContainer").classList.add("hidden");

    showApp();
    showPage("dashboardPage");

    showMessage(
        "globalMessage",
        isStaff()
            ? `Welcome, ${profile.name}!`
            : "Welcome, Scholar! You can view your own scholarship records and submit semester requirements.",
        "success"
    );

    await refreshAll();
}

async function checkSession() {
    showLogin();

    const { data, error } = await db.auth.getSession();

    if (error) {
        showMessage("loginMessage", error.message, "error");
        return;
    }

    if (data.session) {
        await enterApp(data.session.user);
    }
}

async function login(event) {
    event.preventDefault();

    const button = $("loginButton");
    button.disabled = true;
    button.textContent = "Signing in...";

    showMessage("loginMessage", "");

    const { data, error } = await db.auth.signInWithPassword({
        email: $("email").value.trim(),
        password: $("password").value
    });

    button.disabled = false;
    button.textContent = "Login";

    if (error) {
        showMessage("loginMessage", error.message, "error");
        return;
    }

    await enterApp(data.user);
}

async function logout() {
    const { error } = await db.auth.signOut();

    if (error) {
        showMessage("globalMessage", error.message, "error");
        return;
    }

    currentUser = null;
    currentRole = "student";
    scholarships = [];
    submissions = [];

    $("loginForm").reset();
    showLogin();
    showMessage("loginMessage", "You have signed out.", "success");
}

async function refreshAll() {
    if (!currentUser) return;

    await Promise.all([loadScholarships(), loadSubmissions()]);
    updateDashboard();
}

async function loadScholarships() {
    const { data, error } = await db
        .from("scholarships")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Scholarship loading failed:", error);
        scholarships = [];

        $("scholarshipTable").innerHTML =
            `<tr><td colspan="5">Could not load records. Check your database permissions.</td></tr>`;

        showMessage("scholarshipMessage", error.message, "error");
        updateScholarshipOptions();
        return;
    }

    scholarships = data || [];
    renderScholarships();
    updateScholarshipOptions();
}

function renderScholarships() {
    const search = $("scholarshipSearch").value.toLowerCase();

    const filtered = scholarships.filter((item) =>
        String(item.student_name || "").toLowerCase().includes(search) ||
        String(item.scholarship_name || "").toLowerCase().includes(search) ||
        String(item.status || "").toLowerCase().includes(search)
    );

    if (!filtered.length) {
        $("scholarshipTable").innerHTML =
            `<tr><td colspan="5">No scholarship records found.</td></tr>`;
        return;
    }

    $("scholarshipTable").innerHTML = filtered.map((item) => {
        let actions = "View only";

        if (isStaff()) {
            actions = `
                <button class="action-button edit-button"
                    data-action="edit-scholarship"
                    data-id="${escapeHTML(item.id)}">Edit</button>
            `;
        }

        if (isAdmin()) {
            actions += `
                <button class="action-button delete-button"
                    data-action="delete-scholarship"
                    data-id="${escapeHTML(item.id)}">Delete</button>
            `;
        }

        return `
            <tr>
                <td>${escapeHTML(item.student_name)}</td>
                <td>${escapeHTML(item.scholarship_name)}</td>
                <td>${money(item.amount)}</td>
                <td>${statusBadge(item.status)}</td>
                <td>${actions}</td>
            </tr>
        `;
    }).join("");
}

function updateScholarshipOptions() {
    const select = $("submissionScholarship");
    const previousValue = select.value;

    select.innerHTML = `<option value="">Select scholarship</option>`;

    scholarships.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = `${item.student_name} - ${item.scholarship_name}`;
        select.appendChild(option);
    });

    if (scholarships.some((item) => String(item.id) === previousValue)) {
        select.value = previousValue;
    }
}

function updateDashboard() {
    $("total").textContent = scholarships.length;

    $("pending").textContent = scholarships.filter(
        (item) => item.status === "Pending"
    ).length;

    $("compliant").textContent = scholarships.filter(
        (item) => item.status === "Compliant"
    ).length;

    $("deficient").textContent = scholarships.filter(
        (item) => item.status === "With Deficiency"
    ).length;
}

function resetScholarshipForm() {
    $("scholarshipForm").reset();
    $("scholarshipId").value = "";
    $("scholarshipFormTitle").textContent = "Add Scholarship";
    showMessage("scholarshipFormMessage", "");
}

function openScholarshipForm(item = null) {
    if (!isStaff()) {
        showMessage("scholarshipMessage", "Only Staff can add or edit records.", "error");
        return;
    }

    resetScholarshipForm();

    if (item) {
        $("scholarshipId").value = item.id;
        $("studentName").value = item.student_name || "";
        $("scholarshipName").value = item.scholarship_name || "";
        $("scholarshipAmount").value = item.amount ?? 0;
        $("scholarshipStatus").value = item.status || "Pending";
        $("studentUserId").value = item.user_id || "";
        $("scholarshipFormTitle").textContent = "Edit Scholarship";
    }

    $("scholarshipFormContainer").classList.remove("hidden");
    $("scholarshipFormContainer").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

async function saveScholarship(event) {
    event.preventDefault();

    if (!isStaff()) {
        showMessage("scholarshipFormMessage", "Permission denied.", "error");
        return;
    }

    const id = $("scholarshipId").value;

    const record = {
        student_name: $("studentName").value.trim(),
        scholarship_name: $("scholarshipName").value.trim(),
        amount: Number($("scholarshipAmount").value),
        status: $("scholarshipStatus").value,
        user_id: $("studentUserId").value.trim() || null
    };

    showMessage("scholarshipFormMessage", "Saving...");

    const result = id
        ? await db.from("scholarships").update(record).eq("id", id)
        : await db.from("scholarships").insert(record);

    if (result.error) {
        showMessage("scholarshipFormMessage", result.error.message, "error");
        return;
    }

    resetScholarshipForm();
    $("scholarshipFormContainer").classList.add("hidden");

    showMessage("scholarshipMessage", "Scholarship saved successfully.", "success");
    await refreshAll();
}

async function deleteScholarship(id) {
    showMessage("scholarshipMessage", "Scholarship deletion is disabled.", "error");
}

// Validate the selected document before uploading.
function validateRequirementFile(file) {
    if (!file) {
        return "Please choose a requirement file.";
    }

    if (file.size > MAX_FILE_SIZE) {
        return "The file is too large. Maximum size is 5 MB.";
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
        return "Invalid file type. Please choose a PDF, JPG, or PNG file.";
    }

    return "";
}

// Upload to the scholar's own private folder.
async function uploadRequirement(file, scholarshipId) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const filePath = `${currentUser.id}/${scholarshipId}/${uniqueName}`;

    const { error } = await db.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type
        });

    if (error) {
        throw new Error(`File upload failed: ${error.message}`);
    }

    return filePath;
}

async function loadSubmissions() {
    const { data, error } = await db
        .from("semester_submissions")
        .select(`
            id,
            scholarship_id,
            semester,
            academic_year,
            grade,
            file_url,
            status,
            renewal_decision,
            verification_notes,
            renewal_notes,
            submitted_at,
            scholarships (
                student_name,
                scholarship_name
            )
        `)
        .order("submitted_at", { ascending: false });

    if (error) {
        console.error("Submission loading failed:", error);
        submissions = [];

        $("semesterTable").innerHTML =
            `<tr><td colspan="8">Could not load submissions. Check your database permissions.</td></tr>`;

        showMessage("submissionMessage", error.message, "error");
        return;
    }

    submissions = data || [];
    renderSubmissions();
}

function renderSubmissions() {
    const search = $("submissionSearch").value.toLowerCase();
    const statusFilter = $("submissionStatusFilter").value;

    const filtered = submissions.filter((item) => {
        const studentName = item.scholarships?.student_name || "";
        const scholarshipName = item.scholarships?.scholarship_name || "";

        const matchesSearch = [
            studentName,
            scholarshipName,
            item.semester,
            item.academic_year,
            item.status
        ].some((value) =>
            String(value || "").toLowerCase().includes(search)
        );

        return matchesSearch && (!statusFilter || item.status === statusFilter);
    });

    if (!filtered.length) {
        $("semesterTable").innerHTML =
            `<tr><td colspan="8">No semester submissions found.</td></tr>`;
        return;
    }

    $("semesterTable").innerHTML = filtered.map((item) => {
        const buttons = [];

        if (item.file_url) {
            buttons.push(`
                <button class="action-button edit-button"
                    data-action="view-requirement"
                    data-id="${escapeHTML(item.id)}">View Requirement</button>
            `);
        }

        if (isStaff()) {
            const status = String(item.status || "Pending").toLowerCase();
            const renewal = String(item.renewal_decision || "Pending").toLowerCase();

            if (status === "pending") {
                buttons.push(`
                    <button class="action-button verify-button"
                        data-action="verify-submission"
                        data-id="${escapeHTML(item.id)}">Verify</button>
                    <button class="action-button reject-button"
                        data-action="reject-submission"
                        data-id="${escapeHTML(item.id)}">Reject</button>
                `);
            }

            if (status === "verified" && renewal === "pending") {
                buttons.push(`
                    <button class="action-button edit-button"
                        data-action="approve-renewal"
                        data-id="${escapeHTML(item.id)}">Approve Renewal</button>
                    <button class="action-button delete-button"
                        data-action="reject-renewal"
                        data-id="${escapeHTML(item.id)}">Reject Renewal</button>
                `);
            }
        }

        const actions = buttons.length ? buttons.join("") : "View only";

        return `
            <tr>
                <td>${escapeHTML(item.scholarships?.student_name || "Unknown")}</td>
                <td>${escapeHTML(item.scholarships?.scholarship_name || "Unknown")}</td>
                <td>${escapeHTML(item.semester)}</td>
                <td>${escapeHTML(item.academic_year)}</td>
                <td>${escapeHTML(item.grade)}</td>
                <td>${statusBadge(item.status)}</td>
                <td>${statusBadge(item.renewal_decision)}</td>
                <td>${actions}</td>
            </tr>
        `;
    }).join("");
}

async function saveSubmission(event) {
    event.preventDefault();

    if (!currentUser) {
        showMessage("submissionFormMessage", "Please sign in first.", "error");
        return;
    }

    const scholarshipId = $("submissionScholarship").value;
    const file = $("requirementFile").files[0];

    if (!scholarshipId) {
        showMessage("submissionFormMessage", "Please select a scholarship.", "error");
        return;
    }

    const scholarship = scholarships.find(
        (item) => String(item.id) === String(scholarshipId)
    );

    if (!scholarship) {
        showMessage(
            "submissionFormMessage",
            "The selected scholarship is not available to your account.",
            "error"
        );
        return;
    }

    if (isStaff()) {
        showMessage(
            "submissionFormMessage",
            "This submission form is for Scholar accounts. Please sign in as a Scholar to upload requirements.",
            "error"
        );
        return;
    }

    const fileError = validateRequirementFile(file);

    if (fileError) {
        showMessage("submissionFormMessage", fileError, "error");
        return;
    }

    const semester = $("semester").value;
    const academicYear = $("academicYear").value.trim();
    const grade = Number($("grade").value);
    const submitButton = $("submissionForm").querySelector('button[type="submit"]');

    if (!semester || !academicYear || !Number.isFinite(grade) || grade < 1 || grade > 5) {
        showMessage(
            "submissionFormMessage",
            "Please check the semester, academic year, and grade.",
            "error"
        );
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Uploading...";

    let filePath;

    try {
        showMessage("submissionFormMessage", "Uploading your requirement...");

        filePath = await uploadRequirement(file, scholarshipId);

        showMessage("submissionFormMessage", "Saving submission...");

        const record = {
            scholarship_id: Number(scholarshipId),
            semester,
            academic_year: academicYear,
            grade,
            file_url: filePath,
            status: "Pending",
            renewal_decision: "Pending"
        };

        const { error } = await db
            .from("semester_submissions")
            .insert(record);

        if (error) {
            throw new Error(
                `The file uploaded, but the submission could not be saved: ${error.message}. The uploaded file may need to be removed from Storage.`
            );
        }

        $("submissionForm").reset();

        showMessage(
            "submissionFormMessage",
            "Submission and requirement uploaded successfully!",
            "success"
        );

        await loadSubmissions();
    } catch (error) {
        console.error("Submission error:", error);

        showMessage(
            "submissionFormMessage",
            error.message || "Something went wrong while submitting.",
            "error"
        );
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Submit Record";
    }
}

// Generate a short-lived link to the private document.
async function viewRequirement(submissionId) {
    const item = submissions.find(
        (submission) => String(submission.id) === String(submissionId)
    );

    if (!item || !item.file_url) {
        showMessage("submissionMessage", "Requirement file not found.", "error");
        return;
    }

    showMessage("submissionMessage", "Preparing secure file link...");

    const { data, error } = await db.storage
        .from(BUCKET_NAME)
        .createSignedUrl(item.file_url, 60);

    if (error) {
        console.error("Could not open requirement:", error);

        showMessage(
            "submissionMessage",
            `Could not open the file: ${error.message}. Check your Storage policies.`,
            "error"
        );
        return;
    }

    showMessage(
        "submissionMessage",
        "Secure link created. It expires in 60 seconds.",
        "success"
    );

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

async function updateSubmission(id, updates, successMessage) {
    if (!isStaff()) {
        showMessage("submissionMessage", "Only Staff can review submissions.", "error");
        return;
    }

    const submission = submissions.find(
        (item) => String(item.id) === String(id)
    );

    if (!submission) {
        showMessage("submissionMessage", "Submission not found. Refresh and try again.", "error");
        return;
    }

    if (
        updates.status &&
        String(submission.status).toLowerCase() !== "pending"
    ) {
        showMessage("submissionMessage", "This submission has already been reviewed.", "error");
        return;
    }

    if (
        updates.renewal_decision &&
        (
            String(submission.status).toLowerCase() !== "verified" ||
            String(submission.renewal_decision).toLowerCase() !== "pending"
        )
    ) {
        showMessage("submissionMessage", "This renewal cannot be reviewed again.", "error");
        return;
    }

    if (updates.status === "Rejected") {
        updates.verification_notes =
            prompt("Reason for rejection (optional):") || "";
    }

    if (updates.renewal_decision === "Rejected") {
        updates.renewal_notes =
            prompt("Reason for renewal rejection (optional):") || "";
    }

    const { error } = await db
        .from("semester_submissions")
        .update(updates)
        .eq("id", id);

    if (error) {
        showMessage("submissionMessage", error.message, "error");
        return;
    }

    showMessage("submissionMessage", successMessage, "success");
    await loadSubmissions();
}

function bindEvents() {
    $("loginForm").addEventListener("submit", login);
    $("logoutButton").addEventListener("click", logout);

    document.querySelectorAll(".nav-button").forEach((button) => {
        button.addEventListener("click", () => showPage(button.dataset.page));
    });

    $("refreshAllButton").addEventListener("click", refreshAll);
    $("refreshScholarships").addEventListener("click", loadScholarships);
    $("refreshSubmissions").addEventListener("click", loadSubmissions);

    $("scholarshipSearch").addEventListener("input", renderScholarships);
    $("submissionSearch").addEventListener("input", renderSubmissions);
    $("submissionStatusFilter").addEventListener("change", renderSubmissions);

    $("toggleScholarshipForm").addEventListener("click", () => {
        if (!isStaff()) return;

        if ($("scholarshipFormContainer").classList.contains("hidden")) {
            openScholarshipForm();
        } else {
            $("scholarshipFormContainer").classList.add("hidden");
        }
    });

    $("cancelScholarshipForm").addEventListener("click", () => {
        resetScholarshipForm();
        $("scholarshipFormContainer").classList.add("hidden");
    });

    $("scholarshipForm").addEventListener("submit", saveScholarship);
    $("submissionForm").addEventListener("submit", saveSubmission);

    $("scholarshipTable").addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        const id = button.dataset.id;
        const item = scholarships.find(
            (scholarship) => String(scholarship.id) === id
        );

        if (button.dataset.action === "edit-scholarship" && item) {
            openScholarshipForm(item);
        } else if (button.dataset.action === "delete-scholarship") {
            await deleteScholarship(id);
        }
    });

    $("semesterTable").addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        const id = button.dataset.id;
        const action = button.dataset.action;

        if (action === "view-requirement") {
            await viewRequirement(id);
        } else if (action === "verify-submission") {
            await updateSubmission(
                id,
                {
                    status: "Verified",
                    verified_by: currentUser.id,
                    verified_at: new Date().toISOString()
                },
                "Submission verified."
            );
        } else if (action === "reject-submission") {
            await updateSubmission(
                id,
                {
                    status: "Rejected",
                    verified_by: currentUser.id,
                    verified_at: new Date().toISOString()
                },
                "Submission rejected."
            );
        } else if (action === "approve-renewal") {
            await updateSubmission(
                id,
                {
                    renewal_decision: "Approved",
                    decided_by: currentUser.id,
                    decided_at: new Date().toISOString()
                },
                "Renewal approved."
            );
        } else if (action === "reject-renewal") {
            await updateSubmission(
                id,
                {
                    renewal_decision: "Rejected",
                    decided_by: currentUser.id,
                    decided_at: new Date().toISOString()
                },
                "Renewal rejected."
            );
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    bindEvents();
    showLogin();
    await checkSession();
});

db.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
        currentUser = null;
        currentRole = "student";
        scholarships = [];
        submissions = [];
        showLogin();
    }
});
