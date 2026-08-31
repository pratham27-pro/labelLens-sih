// Real backend implementation. Same three function signatures mockScanService.js used
// (submitPhotoScan, submitVideoScan, getScanResult) so no screen or component needed to change.
//
// Flow: submitPhotoScan uploads the photo and gets back a scan_id immediately (the server
// processes OCR + compliance in the background). getScanResult then polls the scan until it
// leaves PROCESSING and adapts the backend's response shape into the ScanResult shape the
// Result screen already renders (see MOBILE_PLAN.txt section 5).
import { File } from 'expo-file-system';
import { API_BASE_URL } from '../config';

const UPLOAD_URL = `${API_BASE_URL}/api/v1/uploads/image`;
const VIDEO_FRAMES_URL = `${API_BASE_URL}/api/v1/video/frames`;
const scanUrl = (scanId) => `${API_BASE_URL}/api/v1/uploads/${scanId}`;

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 45000;

const DECLARATION_LABELS = {
  manufacturer: 'Manufacturer Name & Address',
  net_quantity: 'Net Quantity',
  mrp: 'Maximum Retail Price',
  mfg_date: 'Month & Year of Manufacture',
  consumer_care: 'Consumer Care Details',
  country_of_origin: 'Country of Origin',
};

// Backend rule ids (server/rules.json) -> frontend declaration types.
const RULE_ID_TO_TYPE = {
  manufacturer_details: 'manufacturer',
  net_quantity: 'net_quantity',
  mrp: 'mrp',
  manufacture_date: 'mfg_date',
  consumer_care: 'consumer_care',
  country_of_origin: 'country_of_origin',
};

const FOUND_STATUS_TO_DECLARATION_STATUS = {
  COMPLIANT: 'ok',
  FORMAT_ERROR: 'wrong_format',
  TOO_SMALL: 'too_small',
};

const SEVERITY_RANK = { CRITICAL: 3, MAJOR: 2, MINOR: 1 };

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Shared by both capture paths: uploads a single label image (a photo, or a frame extracted
// from a 360 video) to the OCR + compliance pipeline and returns its scan_id. filePart is
// either an expo-file-system File (photos/video - see submitPhotoScan) or a plain Blob (video
// frames fetched from the server), in which case filename must be passed explicitly since a
// bare Blob carries no name and the server rejects uploads with no recognized extension.
//
// This must NOT be React Native's classic {uri, name, type} descriptor object - Expo SDK 57's
// global fetch is expo/fetch (WinterCG-compliant), and its FormData only accepts real
// Blob/File-like values, throwing "Unsupported FormDataPart implementation" on that old shape.
async function uploadImageForCompliance(filePart, filename) {
  const form = new FormData();
  if (filename) {
    form.append('file', filePart, filename);
  } else {
    form.append('file', filePart);
  }

  const response = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: form,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Upload failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return { scanId: data.scan_id };
}

export function submitPhotoScan(fileUri) {
  const file = new File(fileUri);
  return uploadImageForCompliance(file, file.name);
}

// The video pipeline (server/routers/video.py) only unwraps a 360 capture into a handful of
// flat label-face crops (front/back/side) - it does not run OCR or compliance itself, and there
// is no endpoint that aggregates declarations across multiple faces yet. As an MVP, this takes
// the first extracted face and runs it through the same single-image compliance pipeline photos
// use, so any declarations that only appear on a different face of the product are not checked.
export async function submitVideoScan(fileUri) {
  const file = new File(fileUri);
  const form = new FormData();
  form.append('file', file, file.name);

  const response = await fetch(VIDEO_FRAMES_URL, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: form,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Video frame extraction failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const frame = data.images?.[0];
  if (!frame) {
    throw new Error('No label faces were detected in the video.');
  }

  const frameResponse = await fetch(`${API_BASE_URL}${frame.url}`);
  if (!frameResponse.ok) {
    throw new Error(`Could not fetch extracted video frame (${frameResponse.status}).`);
  }
  const frameBlob = await frameResponse.blob();

  return uploadImageForCompliance(frameBlob, frame.filename || 'frame.jpg');
}

// Backend bbox is in source-image pixels (x_min/y_min/x_max/y_max); the evidence overlay
// needs 0-1 normalized {x, y, width, height} relative to the same photo.
function normalizedBox(bbox, imageWidth, imageHeight) {
  if (!bbox || !imageWidth || !imageHeight) return null;
  return {
    x: bbox.x_min / imageWidth,
    y: bbox.y_min / imageHeight,
    width: (bbox.x_max - bbox.x_min) / imageWidth,
    height: (bbox.y_max - bbox.y_min) / imageHeight,
  };
}

// Violation records don't carry violation_type directly - it's baked into the title as
// "{field_name} - {VIOLATION_TYPE}" (see server/routers/uploads.py _process_scan).
function violationTypeFromTitle(title) {
  const parts = title.split(' - ');
  return parts[parts.length - 1].toLowerCase();
}

function pickWorstViolation(violations) {
  return violations
    .slice()
    .sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0))[0];
}

function buildDeclarations(scan) {
  const imageWidth = scan.ocr_result?.image_metadata?.width;
  const imageHeight = scan.ocr_result?.image_metadata?.height;

  const foundById = new Map((scan.extracted_declarations || []).map((d) => [d.id, d]));
  const violationsByRuleCode = new Map();
  for (const v of scan.violations || []) {
    if (!violationsByRuleCode.has(v.rule_code)) violationsByRuleCode.set(v.rule_code, []);
    violationsByRuleCode.get(v.rule_code).push(v);
  }

  const allRuleIds = new Set([
    ...Object.keys(RULE_ID_TO_TYPE),
    ...foundById.keys(),
    ...violationsByRuleCode.keys(),
  ]);

  return Array.from(allRuleIds).map((ruleId) => {
    const type = RULE_ID_TO_TYPE[ruleId] || ruleId;
    const found = foundById.get(ruleId);
    const violations = violationsByRuleCode.get(ruleId) || [];
    const label = DECLARATION_LABELS[type] || found?.field_name || ruleId.replace(/_/g, ' ').toUpperCase();

    if (!found) {
      const missing = violations.find((v) => violationTypeFromTitle(v.title) === 'missing');
      return {
        type,
        label,
        status: 'missing',
        message: missing?.description || 'Declaration not found on the label.',
        boundingBox: null,
      };
    }

    const worstViolation = pickWorstViolation(violations);
    const status = worstViolation
      ? violationTypeFromTitle(worstViolation.title)
      : FOUND_STATUS_TO_DECLARATION_STATUS[found.status] || 'ok';

    return {
      type,
      label,
      status,
      message: status === 'ok' ? '' : worstViolation?.description || '',
      boundingBox: normalizedBox(found.bbox, imageWidth, imageHeight),
    };
  });
}

export async function getScanResult(scanId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (true) {
    const response = await fetch(scanUrl(scanId), { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Fetching scan result failed (${response.status})`);
    }
    const scan = await response.json();

    if (scan.status === 'FAILED') {
      throw new Error('Label processing failed on the server.');
    }

    if (scan.status !== 'PROCESSING') {
      return {
        scanId,
        status: scan.status === 'COMPLIANT' ? 'pass' : 'fail',
        evidenceImageUri: scan.image_path || null,
        declarations: buildDeclarations(scan),
      };
    }

    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the scan result.');
    }

    await delay(POLL_INTERVAL_MS);
  }
}
