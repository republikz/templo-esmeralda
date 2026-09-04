import { getBearerToken, migrateCredentials, sanitizeStateForClient, verifySessionToken } from "./_auth.js";
import { getConfig, readStateRow, writeStateRow } from "./_store.js";

const INVESTIGATION_BOARD_MIN_WIDTH = 1200;
const INVESTIGATION_BOARD_MIN_HEIGHT = 900;
const INVESTIGATION_BOARD_MAX_WIDTH = 5000;
const INVESTIGATION_BOARD_MAX_HEIGHT = 4000;
const INVESTIGATION_BOARD_MARGIN_X = 360;
const INVESTIGATION_BOARD_MARGIN_Y = 300;

function jsonResponse(body, init = {}) {
  return new Response(body, {
    status: init.status || 200,
    headers: {
      "Content-Type": init.contentType || "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(init.headers || {})
    }
  });
}

function errorResponse(message, status = 500) {
  return jsonResponse(JSON.stringify({ error: message }), { status });
}

function parseDataUrl(value) {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^data:([^;]+);base64,(.+)$/s.exec(value.trim());
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1],
    base64: match[2]
  };
}

function extensionForMime(mimeType) {
  const lookup = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg"
  };
  return lookup[String(mimeType || "").toLowerCase()] || ".bin";
}

function bytesFromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function isRemoteUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

async function uploadDataUrl({ env, dataUrl, prefix, entityId, field, revision }) {
  const config = getConfig(env);
  const parsed = parseDataUrl(dataUrl);
  if (!parsed || !config.supabaseUrl || !config.serviceKey) {
    return dataUrl;
  }

  const ext = extensionForMime(parsed.mimeType);
  const safePrefix = prefix.replace(/^\/+|\/+$/g, "");
  const safeEntityId = String(entityId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "");
  const safeField = String(field || "image").replace(/[^a-zA-Z0-9_-]/g, "");
  const safeRevision = String(revision || Date.now()).replace(/[^0-9]/g, "");
  const objectPath = `${safePrefix}/${safeEntityId}-${safeField}-${safeRevision}${ext}`;
  const uploadUrl = `${config.supabaseUrl}/storage/v1/object/${config.bucket}/${objectPath}`;
  const publicUrl = `${config.supabaseUrl}/storage/v1/object/public/${config.bucket}/${objectPath}`;

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceKey}`,
      apikey: config.serviceKey,
      "Content-Type": parsed.mimeType,
      "x-upsert": "true"
    },
    body: bytesFromBase64(parsed.base64)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Falha ao enviar imagem para o Supabase (${response.status}): ${detail}`);
  }

  return publicUrl;
}

async function hydrateStateImages(state, env) {
  if (!state || typeof state !== "object") {
    return state;
  }
  const config = getConfig(env);
  if (!config.supabaseUrl || !config.serviceKey) {
    return state;
  }

  const nextState = structuredClone(state);
  const revision = Number(nextState.revision) || Date.now();

  if (Array.isArray(nextState.rooms)) {
    for (const room of nextState.rooms) {
      if (room && typeof room.image === "string" && parseDataUrl(room.image)) {
        room.image = await uploadDataUrl({
          env,
          dataUrl: room.image,
          prefix: "rooms",
          entityId: room.id || crypto.randomUUID(),
          field: "room",
          revision
        });
      }
    }
  }

  if (Array.isArray(nextState.npcs)) {
    for (const npc of nextState.npcs) {
      if (npc && typeof npc.image === "string" && parseDataUrl(npc.image)) {
        npc.image = await uploadDataUrl({
          env,
          dataUrl: npc.image,
          prefix: "npcs",
          entityId: npc.id || crypto.randomUUID(),
          field: "npc",
          revision
        });
      }
    }
  }

  if (nextState.campfire && Array.isArray(nextState.campfire.heroes)) {
    for (const hero of nextState.campfire.heroes) {
      if (hero && typeof hero.image === "string" && parseDataUrl(hero.image)) {
        hero.image = await uploadDataUrl({
          env,
          dataUrl: hero.image,
          prefix: "campfire",
          entityId: hero.id || crypto.randomUUID(),
          field: "hero",
          revision
        });
      }
    }
  }

  if (nextState.journey && Array.isArray(nextState.journey.entries)) {
    for (const entry of nextState.journey.entries) {
      if (entry && typeof entry.image === "string" && parseDataUrl(entry.image)) {
        entry.image = await uploadDataUrl({
          env,
          dataUrl: entry.image,
          prefix: "journey",
          entityId: entry.id || crypto.randomUUID(),
          field: "entry",
          revision
        });
      }
    }
  }

  if (Array.isArray(nextState.trophies)) {
    for (const trophy of nextState.trophies) {
      if (trophy && typeof trophy.image === "string" && parseDataUrl(trophy.image)) {
        trophy.image = await uploadDataUrl({
          env,
          dataUrl: trophy.image,
          prefix: "trophies",
          entityId: trophy.id || crypto.randomUUID(),
          field: "trophy",
          revision
        });
      }
    }
  }

  return nextState;
}

function cloneState(value) {
  return value && typeof value === "object" ? structuredClone(value) : {};
}

function cleanIncomingState(state) {
  const next = cloneState(state);
  delete next.npcRelations;
  delete next.activeUserId;
  delete next._baseRevision;
  delete next._changedFields;
  delete next._changedRecords;
  return next;
}

function changedIdSet(changes, field) {
  if (!changes || !Array.isArray(changes[field])) return null;
  return new Set(changes[field].map((id) => String(id || "")).filter(Boolean));
}

function retainUnchangedRecords(currentItems, incomingItems, changedIds) {
  if (!changedIds) return Array.isArray(incomingItems) ? incomingItems : [];
  const incomingById = new Map((Array.isArray(incomingItems) ? incomingItems : [])
    .filter((item) => item?.id)
    .map((item) => [item.id, item]));
  const current = Array.isArray(currentItems) ? currentItems : [];
  const currentIds = new Set(current.filter((item) => item?.id).map((item) => item.id));
  return [
    ...current.map((item) => changedIds.has(item.id) && incomingById.has(item.id) ? incomingById.get(item.id) : item),
    ...(Array.isArray(incomingItems) ? incomingItems : []).filter((item) => item?.id && !currentIds.has(item.id) && changedIds.has(item.id))
  ];
}

function retainJourneyEntries(currentEntries, incomingEntries, contentChangedIds, commentChanges) {
  if (!contentChangedIds && !commentChanges) return Array.isArray(incomingEntries) ? incomingEntries : [];
  const incomingById = new Map((Array.isArray(incomingEntries) ? incomingEntries : [])
    .filter((entry) => entry?.id)
    .map((entry) => [entry.id, entry]));
  const current = Array.isArray(currentEntries) ? currentEntries : [];
  const currentIds = new Set(current.filter((entry) => entry?.id).map((entry) => entry.id));
  const mergeEntry = (existing) => {
    const incoming = incomingById.get(existing.id);
    if (!incoming) return existing;
    const content = contentChangedIds?.has(existing.id) ? incoming : existing;
    const commentIds = changedIdSet(commentChanges, existing.id);
    const comments = retainUnchangedRecords(existing.comments, incoming.comments, commentIds);
    return { ...content, comments };
  };
  const newEntries = (Array.isArray(incomingEntries) ? incomingEntries : []).filter((entry) => (
    entry?.id && !currentIds.has(entry.id) && contentChangedIds?.has(entry.id)
  ));
  return [...current.map(mergeEntry), ...newEntries];
}

function applyIncomingRecordDelta(currentState, incomingState) {
  const changes = incomingState?._changedRecords;
  if (!changes || typeof changes !== "object") return incomingState;
  const next = structuredClone(incomingState || {});
  ["rooms", "npcs", "financeSources", "ledger", "faithTransactions", "events"].forEach((field) => {
    next[field] = retainUnchangedRecords(currentState[field], next[field], changedIdSet(changes, field));
  });
  next.campfire = next.campfire || {};
  next.campfire.heroes = retainUnchangedRecords(currentState.campfire?.heroes, next.campfire.heroes, changedIdSet(changes, "campfireHeroes"));
  next.campfire.investigationBoard = next.campfire.investigationBoard || {};
  next.campfire.investigationBoard.notes = retainUnchangedRecords(
    currentState.campfire?.investigationBoard?.notes,
    next.campfire.investigationBoard.notes,
    changedIdSet(changes, "investigationNotes")
  );
  next.campfire.investigationBoard.links = retainUnchangedRecords(
    currentState.campfire?.investigationBoard?.links,
    next.campfire.investigationBoard.links,
    changedIdSet(changes, "investigationLinks")
  );
  next.journey = next.journey || {};
  next.journey.entries = retainJourneyEntries(
    currentState.journey?.entries,
    next.journey.entries,
    changedIdSet(changes, "journeyEntryContent") || changedIdSet(changes, "journeyEntries"),
    changes.journeyComments
  );
  next.journey.reads = retainUnchangedRecords(currentState.journey?.reads, next.journey.reads, changedIdSet(changes, "journeyReads"));
  const currentFloors = Array.isArray(currentState.baseMap?.floors) ? currentState.baseMap.floors : [];
  const incomingFloors = Array.isArray(next.baseMap?.floors) ? next.baseMap.floors : [];
  const baseMapFloors = currentFloors.length ? currentFloors : incomingFloors;
  next.baseMap = {
    ...(next.baseMap || {}),
    floors: baseMapFloors.map((floor) => {
      const incomingFloor = incomingFloors.find((candidate) => candidate?.id === floor.id) || floor;
      return { ...floor, ...incomingFloor, zones: retainUnchangedRecords(floor.zones, incomingFloor.zones, changedIdSet(changes, "mapZones")) };
    })
  };
  ["missions", "timeline", "trophies"].forEach((field) => {
    next[field] = retainUnchangedRecords(currentState[field], next[field], changedIdSet(changes, field));
  });
  return next;
}

function recordTime(record) {
  return Number(record?.updatedAt) || Number(record?.createdAt) || 0;
}

function isNewer(incoming, current) {
  return recordTime(incoming) >= recordTime(current);
}

function normalizeDeletedRecord(record) {
  const type = String(record?.type || "").trim();
  const id = String(record?.id || "").trim();
  if (!type || !id) {
    return null;
  }
  return {
    type,
    id,
    deletedAt: Number(record?.deletedAt) || Date.now()
  };
}

function mergeDeletedRecords(currentRecords, incomingRecords) {
  const map = new Map();
  [...(Array.isArray(currentRecords) ? currentRecords : []), ...(Array.isArray(incomingRecords) ? incomingRecords : [])]
    .map(normalizeDeletedRecord)
    .filter(Boolean)
    .forEach((record) => {
      const key = `${record.type}:${record.id}`;
      const existing = map.get(key);
      if (!existing || record.deletedAt > existing.deletedAt) {
        map.set(key, record);
      }
    });
  // Tombstones must remain durable: an offline client must never revive a deleted item.
  return [...map.values()].sort((a, b) => a.deletedAt - b.deletedAt);
}

function tombstoneMap(records) {
  const map = new Map();
  (Array.isArray(records) ? records : []).forEach((record) => {
    const normalized = normalizeDeletedRecord(record);
    if (normalized) {
      map.set(`${normalized.type}:${normalized.id}`, normalized.deletedAt);
    }
  });
  return map;
}

function isDeleted(record, type, tombstones) {
  const deletedAt = tombstones.get(`${type}:${record?.id}`);
  return Boolean(deletedAt);
}

function mergeArrayById(currentItems, incomingItems, type, tombstones, mergeItem) {
  const map = new Map();
  (Array.isArray(currentItems) ? currentItems : []).forEach((item) => {
    if (item?.id && !isDeleted(item, type, tombstones)) {
      map.set(item.id, cloneState(item));
    }
  });
  (Array.isArray(incomingItems) ? incomingItems : []).forEach((item) => {
    if (!item?.id || isDeleted(item, type, tombstones)) {
      return;
    }
    const current = map.get(item.id);
    if (!current) {
      map.set(item.id, cloneState(item));
      return;
    }
    map.set(item.id, mergeItem ? mergeItem(current, item, tombstones) : (isNewer(item, current) ? cloneState(item) : current));
  });
  return [...map.values()];
}

function mergeCampfireHero(currentHero, incomingHero, tombstones) {
  const base = isNewer(incomingHero, currentHero) ? { ...cloneState(currentHero), ...cloneState(incomingHero) } : { ...cloneState(incomingHero), ...cloneState(currentHero) };
  base.goals = mergeArrayById(currentHero.goals, incomingHero.goals, "campfireGoal", tombstones);
  return base;
}

function mergeJourneyEntry(currentEntry, incomingEntry, tombstones) {
  const base = isNewer(incomingEntry, currentEntry) ? { ...cloneState(currentEntry), ...cloneState(incomingEntry) } : { ...cloneState(incomingEntry), ...cloneState(currentEntry) };
  base.comments = mergeArrayById(currentEntry.comments, incomingEntry.comments, "journeyComment", tombstones);
  return base;
}

function mergeInvestigationNote(currentNote, incomingNote) {
  const currentContentTime = Number(currentNote?.contentUpdatedAt) || recordTime(currentNote);
  const incomingContentTime = Number(incomingNote?.contentUpdatedAt) || recordTime(incomingNote);
  const currentPositionTime = Number(currentNote?.positionUpdatedAt) || recordTime(currentNote);
  const incomingPositionTime = Number(incomingNote?.positionUpdatedAt) || recordTime(incomingNote);
  const base = isNewer(incomingNote, currentNote)
    ? { ...cloneState(currentNote), ...cloneState(incomingNote) }
    : { ...cloneState(incomingNote), ...cloneState(currentNote) };
  const contentSource = incomingContentTime >= currentContentTime ? incomingNote : currentNote;
  const positionSource = incomingPositionTime >= currentPositionTime ? incomingNote : currentNote;
  base.title = String(
    Object.prototype.hasOwnProperty.call(contentSource || {}, "title") ? contentSource.title : base.title || ""
  ).trim() || "Nota sem título";
  base.text = Object.prototype.hasOwnProperty.call(contentSource || {}, "text")
    ? String(contentSource.text || "").trim()
    : String(base.text || "").trim();
  base.color = contentSource.color || base.color || "gold";
  base.journeyEntryId = Object.prototype.hasOwnProperty.call(contentSource || {}, "journeyEntryId")
    ? contentSource.journeyEntryId || ""
    : base.journeyEntryId || "";
  base.contentUpdatedAt = Math.max(currentContentTime, incomingContentTime);
  const size = getInvestigationNoteEstimatedSize(base);
  base.x = Math.max(0, Math.min(INVESTIGATION_BOARD_MAX_WIDTH - size.width - 24, Number(positionSource.x) || 0));
  base.y = Math.max(0, Math.min(INVESTIGATION_BOARD_MAX_HEIGHT - size.height - 24, Number(positionSource.y) || 0));
  base.positionUpdatedAt = Math.max(currentPositionTime, incomingPositionTime);
  base.updatedAt = Math.max(recordTime(currentNote), recordTime(incomingNote), base.contentUpdatedAt, base.positionUpdatedAt);
  return base;
}

function getInvestigationNoteEstimatedSize(note) {
  return {
    width: 220,
    height: Math.max(166, 128 + Math.ceil(String(note?.text || "").length / 48) * 18 + (note?.journeyEntryId ? 104 : 0))
  };
}

function getInvestigationBoardSize(notes) {
  const safeNotes = Array.isArray(notes) ? notes : [];
  const maxRight = safeNotes.reduce((max, note) => {
    const size = getInvestigationNoteEstimatedSize(note);
    return Math.max(max, (Number(note.x) || 0) + size.width);
  }, 0);
  const maxBottom = safeNotes.reduce((max, note) => {
    const size = getInvestigationNoteEstimatedSize(note);
    return Math.max(max, (Number(note.y) || 0) + size.height);
  }, 0);
  return {
    width: Math.max(INVESTIGATION_BOARD_MIN_WIDTH, Math.min(INVESTIGATION_BOARD_MAX_WIDTH, Math.ceil(maxRight + INVESTIGATION_BOARD_MARGIN_X))),
    height: Math.max(INVESTIGATION_BOARD_MIN_HEIGHT, Math.min(INVESTIGATION_BOARD_MAX_HEIGHT, Math.ceil(maxBottom + INVESTIGATION_BOARD_MARGIN_Y)))
  };
}

function mergeInvestigationBoard(currentBoard, incomingBoard, tombstones) {
  const notes = mergeArrayById(currentBoard?.notes, incomingBoard?.notes, "campfireInvestigationNote", tombstones, mergeInvestigationNote);
  const noteIds = new Set(notes.map((note) => note.id));
  const links = mergeArrayById(currentBoard?.links, incomingBoard?.links, "campfireInvestigationLink", tombstones)
    .filter((link) => noteIds.has(link.fromNoteId) && noteIds.has(link.toNoteId));
  const size = getInvestigationBoardSize(notes);
  return {
    width: size.width,
    height: size.height,
    migratedFromLegionNotesAt: Math.max(
      Number(currentBoard?.migratedFromLegionNotesAt) || 0,
      Number(incomingBoard?.migratedFromLegionNotesAt) || 0
    ),
    notes,
    links
  };
}

function mergeStates(currentState, incomingState) {
  const current = cleanIncomingState(currentState);
  const incoming = cleanIncomingState(incomingState);
  const changedFields = new Set(Array.isArray(incomingState?._changedFields) ? incomingState._changedFields : []);
  const deletedRecords = mergeDeletedRecords(current.deletedRecords, incoming.deletedRecords);
  const tombstones = tombstoneMap(deletedRecords);
  const merged = {
    ...current,
    updatedAt: Math.max(Number(current.updatedAt) || 0, Number(incoming.updatedAt) || 0, Date.now()),
    deletedRecords
  };

  ["currentDay", "startingBalanceCopper", "autoProcessRecurring", "market"].forEach((field) => {
    if (changedFields.has(field)) {
      merged[field] = incoming[field];
    }
  });

  merged.users = mergeArrayById(current.users, incoming.users, "user", tombstones);
  merged.rooms = mergeArrayById(current.rooms, incoming.rooms, "room", tombstones);
  merged.npcs = mergeArrayById(current.npcs, incoming.npcs, "npc", tombstones);
  merged.financeSources = mergeArrayById(current.financeSources, incoming.financeSources, "source", tombstones);
  merged.ledger = mergeArrayById(current.ledger, incoming.ledger, "ledger", tombstones);
  merged.faithTransactions = mergeArrayById(current.faithTransactions, incoming.faithTransactions, "faithTransaction", tombstones);
  merged.events = mergeArrayById(current.events, incoming.events, "event", tombstones);
  const baseMapFloors = (current.baseMap?.floors?.length ? current.baseMap.floors : incoming.baseMap?.floors) || [];
  merged.baseMap = {
    ...(current.baseMap || {}),
    ...(incoming.baseMap || {}),
    floors: baseMapFloors.map((floor) => {
      const candidate = (incoming.baseMap?.floors || []).find((item) => item?.id === floor.id) || floor;
      return { ...floor, ...candidate, zones: mergeArrayById(floor.zones, candidate.zones, "mapZone", tombstones) };
    })
  };
  merged.missions = mergeArrayById(current.missions, incoming.missions, "mission", tombstones);
  merged.timeline = mergeArrayById(current.timeline, incoming.timeline, "timeline", tombstones);
  merged.trophies = mergeArrayById(current.trophies, incoming.trophies, "trophy", tombstones);

  merged.campfire = {
    ...(current.campfire || {}),
    legionNotes: changedFields.has("campfire.legionNotes") ? incoming.campfire?.legionNotes : current.campfire?.legionNotes,
    heroes: mergeArrayById(current.campfire?.heroes, incoming.campfire?.heroes, "campfireHero", tombstones, mergeCampfireHero),
    investigationBoard: mergeInvestigationBoard(current.campfire?.investigationBoard, incoming.campfire?.investigationBoard, tombstones)
  };

  merged.journey = {
    ...(current.journey || {}),
    notificationBaselineAt: Math.max(
      Number(current.journey?.notificationBaselineAt) || 0,
      Number(incoming.journey?.notificationBaselineAt) || 0
    ),
    reads: mergeArrayById(current.journey?.reads, incoming.journey?.reads, "journeyRead", tombstones),
    entries: mergeArrayById(current.journey?.entries, incoming.journey?.entries, "journeyEntry", tombstones, mergeJourneyEntry)
  };

  delete merged.npcRelations;

  return merged;
}

function preserveServerUsers(currentState, candidateState) {
  return {
    ...candidateState,
    // Credentials and roles are server-owned. User administration has its own authenticated route.
    users: Array.isArray(currentState.users) ? structuredClone(currentState.users) : []
  };
}

function keepExistingAndOwnItems(currentItems, incomingItems, actor, ownerField = "createdByUserId") {
  const current = Array.isArray(currentItems) ? currentItems : [];
  const currentIds = new Set(current.filter((item) => item?.id).map((item) => item.id));
  const incomingById = new Map((Array.isArray(incomingItems) ? incomingItems : []).filter((item) => item?.id).map((item) => [item.id, item]));
  const existing = current.map((item) => item?.[ownerField] === actor.id && incomingById.has(item.id) ? incomingById.get(item.id) : item);
  const ownNew = (Array.isArray(incomingItems) ? incomingItems : []).filter((item) => (
    item?.id && !currentIds.has(item.id) && item[ownerField] === actor.id
  ));
  return [...structuredClone(existing), ...structuredClone(ownNew)];
}

function restrictJourneyForPlayer(currentJourney, incomingJourney, actor) {
  const currentEntries = Array.isArray(currentJourney?.entries) ? currentJourney.entries : [];
  const incomingById = new Map((Array.isArray(incomingJourney?.entries) ? incomingJourney.entries : []).filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  const currentIds = new Set(currentEntries.map((entry) => entry.id));
  const entries = currentEntries.map((entry) => {
    const incoming = incomingById.get(entry.id);
    if (!incoming) return structuredClone(entry);
    const currentComments = Array.isArray(entry.comments) ? entry.comments : [];
    const incomingComments = Array.isArray(incoming.comments) ? incoming.comments : [];
    const currentCommentIds = new Set(currentComments.filter((comment) => comment?.id).map((comment) => comment.id));
    const incomingCommentsById = new Map(incomingComments.filter((comment) => comment?.id).map((comment) => [comment.id, comment]));
    const comments = [
      ...currentComments.map((comment) => comment.userId === actor.id && incomingCommentsById.has(comment.id)
        ? incomingCommentsById.get(comment.id)
        : comment),
      ...incomingComments.filter((comment) => !currentCommentIds.has(comment?.id) && comment?.userId === actor.id)
    ];
    return entry.createdByUserId === actor.id
      ? { ...structuredClone(incoming), comments }
      : { ...structuredClone(entry), comments };
  });
  const ownNew = (Array.isArray(incomingJourney?.entries) ? incomingJourney.entries : [])
    .filter((entry) => entry?.id && !currentIds.has(entry.id) && entry.createdByUserId === actor.id);
  const currentReads = Array.isArray(currentJourney?.reads) ? currentJourney.reads : [];
  const incomingReads = Array.isArray(incomingJourney?.reads) ? incomingJourney.reads : [];
  const incomingReadsById = new Map(incomingReads.filter((read) => read?.id).map((read) => [read.id, read]));
  const readableEntryIds = new Set([...currentIds, ...ownNew.map((entry) => entry.id)]);
  const reads = [
    ...currentReads.map((read) => read.userId === actor.id && incomingReadsById.has(read.id)
      ? incomingReadsById.get(read.id)
      : read),
    ...incomingReads.filter((read) => read?.id && !currentReads.some((current) => current.id === read.id)
      && read.userId === actor.id && readableEntryIds.has(read.entryId))
  ];
  return {
    ...structuredClone(currentJourney || {}),
    entries: [...entries, ...structuredClone(ownNew)],
    reads
  };
}

function canPlayerDeleteRecord(record, currentState, actor) {
  const type = String(record?.type || "");
  const id = String(record?.id || "");
  if (!id) return false;
  const ownedIn = (items, ownerField = "createdByUserId") => (Array.isArray(items) ? items : [])
    .some((item) => item?.id === id && item?.[ownerField] === actor.id);
  if (["source", "ledger", "event"].includes(type)) {
    const collection = type === "source" ? currentState.financeSources : type === "ledger" ? currentState.ledger : currentState.events;
    return ownedIn(collection);
  }
  if (type === "campfireHero") return ownedIn(currentState.campfire?.heroes, "ownerUserId");
  if (type === "journeyEntry") return ownedIn(currentState.journey?.entries);
  if (type === "journeyComment") {
    return (currentState.journey?.entries || []).some((entry) => (entry.comments || [])
      .some((comment) => comment?.id === id && comment.userId === actor.id));
  }
  if (["mapZone", "mission", "timeline"].includes(type)) return true;
  // Investigation notes and links are intentionally shared by the whole table.
  return type === "investigationNote" || type === "investigationLink";
}

function restrictPlayerPayload(currentState, incomingState, actor) {
  const next = structuredClone(incomingState || {});
  // Campaign structure and privileged configuration remain immutable to a player.
  ["rooms", "npcs", "market", "currentDay", "autoProcessRecurring", "startingBalanceCopper", "users"].forEach((field) => {
    next[field] = structuredClone(currentState[field]);
  });
  next.financeSources = keepExistingAndOwnItems(currentState.financeSources, incomingState.financeSources, actor);
  next.ledger = keepExistingAndOwnItems(currentState.ledger, incomingState.ledger, actor, "createdByUserId");
  next.events = keepExistingAndOwnItems(currentState.events, incomingState.events, actor);
  const currentFaith = Array.isArray(currentState.faithTransactions) ? currentState.faithTransactions : [];
  let availableFaith = currentFaith
    .filter((entry) => entry?.userId === actor.id)
    .reduce((total, entry) => total + Number(entry.amount || 0), 0);
  const newFaithUses = (Array.isArray(incomingState.faithTransactions) ? incomingState.faithTransactions : [])
    .filter((entry) => !currentFaith.some((current) => current.id === entry?.id) && (
      entry?.userId === actor.id && entry?.createdByUserId === actor.id && Number(entry?.amount) === -1
    ))
    .filter((entry) => {
      if (availableFaith < 1) return false;
      availableFaith -= 1;
      return true;
    });
  next.faithTransactions = [...structuredClone(currentFaith), ...structuredClone(newFaithUses)];
  next.campfire = {
    ...structuredClone(currentState.campfire || {}),
    investigationBoard: structuredClone(incomingState.campfire?.investigationBoard || currentState.campfire?.investigationBoard || {}),
    heroes: (() => {
      const currentHeroes = Array.isArray(currentState.campfire?.heroes) ? currentState.campfire.heroes : [];
      const incomingById = new Map((Array.isArray(incomingState.campfire?.heroes) ? incomingState.campfire.heroes : []).filter((hero) => hero?.id).map((hero) => [hero.id, hero]));
      const currentIds = new Set(currentHeroes.map((hero) => hero.id));
      return [
        ...currentHeroes.map((hero) => hero.ownerUserId === actor.id && incomingById.has(hero.id) ? incomingById.get(hero.id) : hero),
        ...(Array.isArray(incomingState.campfire?.heroes) ? incomingState.campfire.heroes : []).filter((hero) => hero?.id && !currentIds.has(hero.id) && hero.ownerUserId === actor.id)
      ];
    })()
  };
  next.journey = restrictJourneyForPlayer(currentState.journey, incomingState.journey, actor);
  next.baseMap = structuredClone(incomingState.baseMap || currentState.baseMap || {});
  next.missions = structuredClone(incomingState.missions || currentState.missions || []);
  next.timeline = structuredClone(incomingState.timeline || currentState.timeline || []);
  next.trophies = structuredClone(currentState.trophies || []);
  const currentDeleted = Array.isArray(currentState.deletedRecords) ? currentState.deletedRecords : [];
  const existingDeleted = new Set(currentDeleted.map((record) => `${record?.type || ""}:${record?.id || ""}`));
  const newAllowedDeleted = (Array.isArray(incomingState.deletedRecords) ? incomingState.deletedRecords : [])
    .filter((record) => {
      const key = `${record?.type || ""}:${record?.id || ""}`;
      return !existingDeleted.has(key) && canPlayerDeleteRecord(record, currentState, actor);
    });
  next.deletedRecords = [...structuredClone(currentDeleted), ...structuredClone(newAllowedDeleted)];
  return next;
}

function comparable(value, ignored = []) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => comparable(entry, ignored));
  const copy = {};
  Object.entries(value).forEach(([key, entry]) => {
    if (!ignored.includes(key)) copy[key] = comparable(entry, ignored);
  });
  return copy;
}

function hasChanged(current, incoming, ignored = ["updatedAt", "createdAt"]) {
  return JSON.stringify(comparable(current, ignored)) !== JSON.stringify(comparable(incoming, ignored));
}

function stampCollection(currentItems, incomingItems, now) {
  const currentById = new Map((Array.isArray(currentItems) ? currentItems : []).filter((item) => item?.id).map((item) => [item.id, item]));
  return (Array.isArray(incomingItems) ? incomingItems : []).map((item) => {
    if (!item?.id) return item;
    const current = currentById.get(item.id);
    if (!current || hasChanged(current, item)) return { ...item, createdAt: Number(item.createdAt) || now, updatedAt: now };
    return item;
  });
}

function stampInvestigationNotes(currentNotes, incomingNotes, now) {
  const currentById = new Map((Array.isArray(currentNotes) ? currentNotes : []).filter((note) => note?.id).map((note) => [note.id, note]));
  return (Array.isArray(incomingNotes) ? incomingNotes : []).map((note) => {
    const current = currentById.get(note?.id);
    if (!current) return { ...note, createdAt: Number(note?.createdAt) || now, updatedAt: now, contentUpdatedAt: now, positionUpdatedAt: now };
    const contentChanged = hasChanged(current, note, ["updatedAt", "createdAt", "x", "y", "positionUpdatedAt", "contentUpdatedAt"]);
    const positionChanged = Number(current.x) !== Number(note.x) || Number(current.y) !== Number(note.y);
    if (!contentChanged && !positionChanged) return note;
    return {
      ...note,
      contentUpdatedAt: contentChanged ? now : Number(note.contentUpdatedAt) || Number(current.contentUpdatedAt) || now,
      positionUpdatedAt: positionChanged ? now : Number(note.positionUpdatedAt) || Number(current.positionUpdatedAt) || now,
      updatedAt: now
    };
  });
}

function journeyEntryContentChanged(current, incoming) {
  return JSON.stringify(comparable(current, ["updatedAt", "createdAt", "comments"]))
    !== JSON.stringify(comparable(incoming, ["updatedAt", "createdAt", "comments"]));
}

function stampJourneyEntries(currentEntries, incomingEntries, now) {
  const currentById = new Map((Array.isArray(currentEntries) ? currentEntries : [])
    .filter((entry) => entry?.id)
    .map((entry) => [entry.id, entry]));
  return (Array.isArray(incomingEntries) ? incomingEntries : []).map((entry) => {
    const current = currentById.get(entry?.id);
    const contentChanged = !current || journeyEntryContentChanged(current, entry);
    return {
      ...entry,
      createdAt: Number(entry?.createdAt) || Number(current?.createdAt) || now,
      updatedAt: contentChanged ? now : Number(current?.updatedAt) || Number(entry?.updatedAt) || now,
      comments: stampCollection(current?.comments, entry?.comments, now)
    };
  });
}

function stampIncomingState(currentState, incomingState) {
  const now = Date.now();
  const next = structuredClone(incomingState || {});
  ["rooms", "npcs", "financeSources", "ledger", "faithTransactions", "events", "missions", "timeline", "trophies"].forEach((field) => {
    next[field] = stampCollection(currentState[field], next[field], now);
  });
  next.campfire = next.campfire || {};
  next.campfire.heroes = stampCollection(currentState.campfire?.heroes, next.campfire.heroes, now);
  next.campfire.investigationBoard = next.campfire.investigationBoard || {};
  next.campfire.investigationBoard.notes = stampInvestigationNotes(currentState.campfire?.investigationBoard?.notes, next.campfire.investigationBoard.notes, now);
  next.campfire.investigationBoard.links = stampCollection(currentState.campfire?.investigationBoard?.links, next.campfire.investigationBoard.links, now);
  next.journey = next.journey || {};
  next.journey.entries = stampJourneyEntries(currentState.journey?.entries, next.journey.entries, now);
  const currentReadsById = new Map((currentState.journey?.reads || []).filter((read) => read?.id).map((read) => [read.id, read]));
  next.journey.reads = (Array.isArray(next.journey.reads) ? next.journey.reads : []).map((read) => {
    const current = currentReadsById.get(read?.id);
    if (!current || hasChanged(current, read, ["updatedAt", "createdAt"])) {
      return { ...read, createdAt: Number(read?.createdAt) || now, updatedAt: now, readAt: now };
    }
    return read;
  });
  next.baseMap = next.baseMap || {};
  const currentFloors = Array.isArray(currentState.baseMap?.floors) ? currentState.baseMap.floors : [];
  next.baseMap.floors = (Array.isArray(next.baseMap.floors) ? next.baseMap.floors : []).map((floor) => {
    const currentFloor = currentFloors.find((item) => item?.id === floor?.id);
    return { ...floor, zones: stampCollection(currentFloor?.zones, floor?.zones, now) };
  });
  return next;
}

async function authenticateRequest(request, env, currentState) {
  const session = await verifySessionToken(env, getBearerToken(request));
  if (!session) return null;
  const user = (currentState.users || []).find((entry) => entry.id === session.sub);
  if (!user || Number(user.authVersion) !== Number(session.ver) || user.role !== session.role) return null;
  return user;
}

export async function onRequest({ request, env }) {
  try {
    if (!["GET", "PUT"].includes(request.method)) return errorResponse("Método não permitido.", 405);

    const row = await readStateRow(env);
    if (!row?.state_json) return errorResponse("Campanha não inicializada.", 503);
    const migrated = await migrateCredentials(row.state_json);
    const currentState = migrated.state;
    const actor = await authenticateRequest(request, env, currentState);
    if (!actor) return errorResponse("Autenticação necessária.", 401);

    const currentRevision = Math.max(Number(row.revision) || 0, Number(currentState.revision) || 0);
    let effectiveRevision = currentRevision;
    if (migrated.changed) {
      effectiveRevision = currentRevision + 1;
      currentState.revision = effectiveRevision;
      currentState.updatedAt = Date.now();
      await writeStateRow(env, currentState, Number(row.revision) || 0);
    }

    if (request.method === "GET") {
      const etag = `\"state-${effectiveRevision}\"`;
      if (request.headers.get("If-None-Match") === etag) {
        return new Response(null, { status: 304, headers: { "Cache-Control": "no-store", ETag: etag } });
      }
      return jsonResponse(JSON.stringify(sanitizeStateForClient(currentState)), {
        status: 200,
        headers: { ETag: etag, "X-State-Revision": String(effectiveRevision) }
      });
    }

    const baseRevision = Math.max(0, Number.parseInt(request.headers.get("X-Base-Revision") || "0", 10) || 0);
    const rebased = baseRevision > 0 && baseRevision < effectiveRevision;
    const incoming = await request.json();
    const deltaIncoming = applyIncomingRecordDelta(currentState, incoming);
    const authorizedIncoming = actor.role === "admin"
      ? deltaIncoming
      : restrictPlayerPayload(currentState, deltaIncoming, actor);
    const stampedIncoming = stampIncomingState(currentState, authorizedIncoming);
    const hydrated = await hydrateStateImages(cleanIncomingState(stampedIncoming), env);
    const merged = mergeStates(currentState, { ...hydrated, _changedFields: incoming._changedFields });
    const finalState = cleanIncomingState(preserveServerUsers(currentState, merged));
    finalState.revision = Math.max(effectiveRevision, Number(currentState.revision) || 0) + 1;
    finalState.updatedAt = Date.now();
    finalState.deletedRecords = Array.isArray(finalState.deletedRecords) ? finalState.deletedRecords : [];
    await writeStateRow(env, finalState, migrated.changed ? effectiveRevision : Number(row.revision) || 0);
    return jsonResponse(JSON.stringify(sanitizeStateForClient(finalState)), {
      status: 200,
      headers: { "X-State-Rebased": rebased ? "1" : "0", "X-State-Revision": String(finalState.revision), ETag: `\"state-${finalState.revision}\"` }
    });
  } catch (error) {
    return errorResponse(error?.message || "Erro inesperado ao processar o estado.", error?.status === 409 ? 409 : 500);
  }
}
