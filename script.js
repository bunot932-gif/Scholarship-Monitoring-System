
const SUPABASE_URL = "https://wpzecjwjbzjwduviksri.supabase.co";
const SUPABASE_KEY = "sb_publishable_dWXwENqpokifN2DCBX4y-g_BCv7W9CI";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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

    if (type) {
        element.classList.add(type);
    }
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

    if (
        value === "compliant" ||
        value === "verified" ||
        value === "approved"
    ) {
        return "status-compliant";
    }

    if (
        value === "with deficiency" ||
        value === "rejected"
    ) {
        return "status-deficiency";
    }

    return "status-pending";
}

function statusBadge(status) {
    return `<span class="status-badge ${statusClass(status)}">${escapeHTML(status || "Pending")}</span>`;
}

function isStaff() {
    return currentRole === "staff" || currentRole === "admin";
}

function isAdmin() {
    return currentRole === "admin";
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

    if (selectedPage) {
        selectedPage.classList.remove("hidden");
    }

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

    if (!data) {
        return { role: "student", name: user.email || "User" };
    }

    return {
        role: data.role || "student",
        name: data.full_name || user.email || "User"
    };
}

async function enterApp(user) {
    currentUser = user;

    const profile = await getUserRole(user);
    currentRole = profile.role;

    $("userEmail").textContent = user.email || profile.name;
    $("userRole").textContent = `Role: ${currentRole}`;

    $("toggleScholarshipForm").classList.toggle("hidden", !isStaff());
    $("scholarshipFormContainer").classList.add("hidden");

    showApp();
    showPage("dashboardPage");

    showMessage(
        "globalMessage",
        currentRole === "student"
            ? "You are signed in as a student. Only records permitted by your account can be displayed."
            : `Welcome, ${profile.name}!`,
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

    const email = $("email").value.trim();
    const password = $("password").value;
    const button = $("loginButton");

    button.disabled = true;
    button.textContent = "Signing in...";
    showMessage("loginMessage", "");

    const { data, error } = await db.auth.signInWithPassword({
        email,
        password
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

    await Promise.all([
        loadScholarships(),
        loadSubmissions()
    ]);

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

    const filtered = scholarships.filter((item) => {
        return (
            String(item.student_name || "").toLowerCase().includes(search) ||
            String(item.scholarship_name || "").toLowerCase().includes(search) ||
            String(item.status || "").toLowerCase().includes(search)
        );
    });

    if (filtered.length === 0) {
        $("scholarshipTable").innerHTML =
            `<tr><td colspan="5">No scholarship records found.</td></tr>`;
        return;
    }

    $("scholarshipTable").innerHTML = filtered.map((item) => {
        let actions = "";

        if (isStaff()) {
            actions += `
                <button class="action-button edit-button"
                    data-action="edit-scholarship"
                    data-id="${item.id}">Edit</button>`;
        }

        if (isAdmin()) {
            actions += `
                <button class="action-button delete-button"
                    data-action="delete-scholarship"
                    data-id="${item.id}">Delete</button>`;
        }

        if (!actions) actions = "View only";

        return `
            <tr>
                <td>${escapeHTML(item.student_name)}</td>
                <td>${escapeHTML(item.scholarship_name)}</td>
                <td>${money(item.amount)}</td>
                <td>${statusBadge(item.status)}</td>
                <td>${actions}</td>
            </tr>`;
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
        showMessage(
            "scholarshipMessage",
            "Only staff and admins can add or edit scholarship records.",
            "error"
        );
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

    let result;

    if (id) {
        result = await db
            .from("scholarships")
            .update(record)
            .eq("id", id);
    } else {
        result = await db
            .from("scholarships")
            .insert(record);
    }

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
    if (!isAdmin()) {
        showMessage("scholarshipMessage", "Only admins can delete records.", "error");
        return;
    }

    const confirmed = confirm("Are you sure you want to delete this scholarship?");
    if (!confirmed) return;

    const { error } = await db
        .from("scholarships")
        .delete()
        .eq("id", id);

    if (error) {
        showMessage("scholarshipMessage", error.message, "error");
        return;
    }

    showMessage("scholarshipMessage", "Scholarship deleted.", "success");
    await refreshAll();
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
        ].some((value) => String(value || "").toLowerCase().includes(search));

        const matchesStatus = !statusFilter || item.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    if (filtered.length === 0) {
        $("semesterTable").innerHTML =
            `<tr><td colspan="8">No semester submissions found.</td></tr>`;
        return;
    }

    $("semesterTable").innerHTML = filtered.map((item) => {
        let actions = "View only";

        if (isStaff()) {
            const status = String(item.status || "Pending").toLowerCase();
            const renewal = String(item.renewal_decision || "Pending").toLowerCase();

            const buttons = [];

            // Show verification buttons only while submission is pending.
            if (status === "pending") {
                buttons.push(`
                    <button class="action-button verify-button"
                        data-action="verify-submission"
                        data-id="${item.id}">Verify</button>
                    <button class="action-button reject-button"
                        data-action="reject-submission"
                        data-id="${item.id}">Reject</button>
                `);
            }

            // Renewal can be reviewed only after the submission is verified.
            if (status === "verified" && renewal === "pending") {
                buttons.push(`
                    <button class="action-button edit-button"
                        data-action="approve-renewal"
                        data-id="${item.id}">Approve Renewal</button>
                    <button class="action-button delete-button"
                        data-action="reject-renewal"
                        data-id="${item.id}">Reject Renewal</button>
                `);
            }

            actions = buttons.length > 0
                ? buttons.join("")
                : "No actions available";
        }

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
            </tr>`;
    }).join("");
}

async function saveSubmission(event) {
    event.preventDefault();

    const scholarshipId = $("submissionScholarship").value;

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

    const record = {
        scholarship_id: Number(scholarshipId),
        semester: $("semester").value,
        academic_year: $("academicYear").value.trim(),
        grade: Number($("grade").value),
        status: "Pending",
        renewal_decision: "Pending"
    };

    showMessage("submissionFormMessage", "Submitting...");

    const { error } = await db
        .from("semester_submissions")
        .insert(record);

    if (error) {
        showMessage("submissionFormMessage", error.message, "error");
        return;
    }

    $("submissionForm").reset();

    showMessage(
        "submissionFormMessage",
        "Semester submission added successfully.",
        "success"
    );

    await loadSubmissions();
}

async function updateSubmission(id, updates, successMessage) {
    if (!isStaff()) {
        showMessage("submissionMessage", "Only staff and admins can review submissions.", "error");
        return;
    }

    const submission = submissions.find(
        (item) => String(item.id) === String(id)
    );

    if (!submission) {
        showMessage("submissionMessage", "Submission not found. Refresh and try again.", "error");
        return;
    }

    // Prevent repeating actions after a decision has been made.
    if (updates.status && String(submission.status).toLowerCase() !== "pending") {
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
        const action = button.dataset.action;
        const item = scholarships.find(
            (scholarship) => String(scholarship.id) === id
        );

        if (action === "edit-scholarship" && item) {
            openScholarshipForm(item);
        } else if (action === "delete-scholarship") {
            await deleteScholarship(id);
        }
    });

    $("semesterTable").addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        const id = button.dataset.id;
        const action = button.dataset.action;

        if (action === "verify-submission") {
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

db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
        currentUser = null;
        currentRole = "student";
        showLogin();
    }
});
