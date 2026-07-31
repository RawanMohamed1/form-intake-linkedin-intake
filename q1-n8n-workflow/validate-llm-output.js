// Parses Claude's response and validates it structurally.
// If anything is malformed, flag for human review instead of failing the workflow.

const item = $input.item.json;
const enquiry = $('Edit Fields').item.json; // adjust node name to match your Set node

let parsed;
let parseError = null;

try {
  const rawText = item.content[0].text.trim();
  parsed = JSON.parse(rawText);
} catch (e) {
  parseError = e.message;
  parsed = {};
}

const validEnquiryTypes = ['job_requisition', 'general_question', 'admin_request', 'unclear'];
const validUrgency = ['immediate', 'soon', 'unspecified'];

const isValid =
  !parseError &&
  typeof parsed.summary === 'string' &&
  validEnquiryTypes.includes(parsed.enquiry_type) &&
  validUrgency.includes(parsed.urgency) &&
  typeof parsed.confidence === 'number';

return {
  json: {
    ...enquiry,
    contact_name: parsed.contact_name ?? enquiry.submitted_name ?? null,
    contact_email: parsed.contact_email ?? null,
    contact_phone: parsed.contact_phone ?? null,
    company: parsed.company ?? enquiry.submitted_company ?? null,
    role_sought: parsed.role_sought ?? null,
    location: parsed.location ?? null,
    salary_budget: parsed.salary_budget ?? null,
    urgency: parsed.urgency ?? 'unspecified',
    enquiry_type: isValid ? parsed.enquiry_type : 'unclear',
    summary: parsed.summary ?? 'Could not parse enquiry — needs manual review.',
    confidence: isValid ? parsed.confidence : 0,
    llm_parse_error: parseError,
    needs_human_review: !isValid
  }
};
