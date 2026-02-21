import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const normalizeEntityType = (value) => String(value || '').trim().toLowerCase();

const attendanceRestore = async ({ eventSlug, command, getAuthHeader }) => {
    const entries = Array.isArray(command?.entries) ? command.entries : [];
    const roundId = Number(command?.round_id);
    if (!eventSlug || !Number.isFinite(roundId) || entries.length === 0) return;
    await Promise.all(entries.map((entry) => {
        const entityType = normalizeEntityType(entry.entity_type);
        const entityId = Number(entry.entity_id);
        if (!['user', 'team'].includes(entityType) || !Number.isFinite(entityId)) {
            return Promise.resolve();
        }
        return axios.post(`${API}/pda-admin/events/${eventSlug}/attendance/mark`, {
            entity_type: entityType,
            user_id: entityType === 'user' ? entityId : null,
            team_id: entityType === 'team' ? entityId : null,
            round_id: roundId,
            is_present: Boolean(entry.is_present),
        }, { headers: getAuthHeader() });
    }));
};

const scoresRestore = async ({ eventSlug, command, getAuthHeader }) => {
    const roundId = Number(command?.round_id);
    const entries = Array.isArray(command?.entries) ? command.entries : [];
    if (!eventSlug || !Number.isFinite(roundId) || entries.length === 0) return;
    const payload = entries
        .map((entry) => {
            const entityType = normalizeEntityType(entry.entity_type);
            const entityId = Number(entry.entity_id);
            if (!['user', 'team'].includes(entityType) || !Number.isFinite(entityId)) return null;
            return {
                entity_type: entityType,
                user_id: entityType === 'user' ? entityId : null,
                team_id: entityType === 'team' ? entityId : null,
                criteria_scores: entry.criteria_scores && typeof entry.criteria_scores === 'object' ? entry.criteria_scores : {},
                is_present: Boolean(entry.is_present),
            };
        })
        .filter(Boolean);
    if (!payload.length) return;
    await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/scores`, payload, {
        headers: getAuthHeader(),
    });
};

const panelAssignmentsRestore = async ({ eventSlug, command, getAuthHeader }) => {
    const roundId = Number(command?.round_id);
    const assignments = Array.isArray(command?.assignments) ? command.assignments : [];
    if (!eventSlug || !Number.isFinite(roundId) || assignments.length === 0) return;
    await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/panels/assignments`, {
        assignments,
    }, { headers: getAuthHeader() });
};

const panelDefinitionsRestore = async ({ eventSlug, command, getAuthHeader }) => {
    const roundId = Number(command?.round_id);
    const panels = Array.isArray(command?.panels) ? command.panels : [];
    if (!eventSlug || !Number.isFinite(roundId)) return;
    await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/panels`, {
        panels,
    }, { headers: getAuthHeader() });
};

const roundPatchRestore = async ({ eventSlug, command, getAuthHeader }) => {
    const roundId = Number(command?.round_id);
    const payload = command?.payload && typeof command.payload === 'object' ? command.payload : null;
    if (!eventSlug || !Number.isFinite(roundId) || !payload) return;
    await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}`, payload, {
        headers: getAuthHeader(),
    });
};

const roundStateRestore = async ({ eventSlug, command, getAuthHeader }) => {
    const roundId = Number(command?.round_id);
    const state = String(command?.state || '').trim();
    if (!eventSlug || !Number.isFinite(roundId) || !state) return;
    await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}`, {
        state,
    }, { headers: getAuthHeader() });
};

const roundFreezeRestore = async ({ eventSlug, command, getAuthHeader }) => {
    const roundId = Number(command?.round_id);
    const shouldFreeze = command?.is_frozen === true;
    if (!eventSlug || !Number.isFinite(roundId)) return;
    const endpoint = shouldFreeze ? 'freeze' : 'unfreeze';
    await axios.post(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}/${endpoint}`, {}, {
        headers: getAuthHeader(),
    });
};

const eventFlagsRestore = async ({ eventSlug, command, getAuthHeader }) => {
    if (!eventSlug) return;
    const requests = [];
    if (typeof command?.registration_open === 'boolean') {
        requests.push(axios.put(`${API}/pda-admin/events/${eventSlug}/registration`, {
            registration_open: command.registration_open,
        }, { headers: getAuthHeader() }));
    }
    if (typeof command?.is_visible === 'boolean') {
        requests.push(axios.put(`${API}/pda-admin/events/${eventSlug}/visibility`, {
            is_visible: command.is_visible,
        }, { headers: getAuthHeader() }));
    }
    if (!requests.length) return;
    await Promise.all(requests);
};

const participantStatusBulkRestore = async ({ eventSlug, command, getAuthHeader }) => {
    const updates = Array.isArray(command?.updates) ? command.updates : [];
    if (!eventSlug) return;
    if (updates.length) {
        await axios.put(`${API}/pda-admin/events/${eventSlug}/registrations/status-bulk`, {
            updates,
        }, { headers: getAuthHeader() });
    }
    const roundRestore = command?.round_restore && typeof command.round_restore === 'object'
        ? command.round_restore
        : null;
    const roundId = Number(roundRestore?.round_id);
    const roundState = String(roundRestore?.state || '').trim();
    if (roundRestore && Number.isFinite(roundId) && roundState) {
        await axios.put(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}`, {
            state: roundState,
        }, { headers: getAuthHeader() });
    }
};

const roundDeleteCreated = async ({ eventSlug, command, getAuthHeader }) => {
    const roundId = Number(command?.round_id);
    if (!eventSlug || !Number.isFinite(roundId)) return;
    await axios.delete(`${API}/pda-admin/events/${eventSlug}/rounds/${roundId}`, {
        headers: getAuthHeader(),
    });
};

const EXECUTORS = {
    attendance_restore: attendanceRestore,
    scores_restore: scoresRestore,
    panel_assignments_restore: panelAssignmentsRestore,
    panel_definitions_restore: panelDefinitionsRestore,
    round_patch_restore: roundPatchRestore,
    round_state_restore: roundStateRestore,
    round_freeze_restore: roundFreezeRestore,
    event_flags_restore: eventFlagsRestore,
    participant_status_bulk_restore: participantStatusBulkRestore,
    round_delete_created: roundDeleteCreated,
};

export const executeUndoCommand = async ({ eventSlug, command, getAuthHeader }) => {
    const type = String(command?.type || '').trim();
    const executor = EXECUTORS[type];
    if (!executor) {
        throw new Error(`Unsupported undo command: ${type || 'unknown'}`);
    }
    await executor({ eventSlug, command, getAuthHeader });
};
