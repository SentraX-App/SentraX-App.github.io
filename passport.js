const BLOOD_GROUPS = ["Don't know", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENOTYPES = ["Don't know", "AA", "AS", "SS", "AC", "SC"];

function populatePassportSelects() {
  const bgSelect = document.getElementById('pp-bloodgroup');
  const gtSelect = document.getElementById('pp-genotype');
  bgSelect.innerHTML = BLOOD_GROUPS.map(function(g) { return '<option value="' + g + '">' + g + '</option>'; }).join('');
  gtSelect.innerHTML = GENOTYPES.map(function(g) { return '<option value="' + g + '">' + g + '</option>'; }).join('');
}

function savePassport() {
  const passport = {
    bloodGroup: document.getElementById('pp-bloodgroup').value,
    genotype: document.getElementById('pp-genotype').value,
    allergies: document.getElementById('pp-allergies').value.trim(),
    conditions: document.getElementById('pp-conditions').value.trim(),
    history: document.getElementById('pp-history').value.trim(),
    vaccinations: document.getElementById('pp-vaccinations').value.trim(),
    height: document.getElementById('pp-height').value,
    weight: document.getElementById('pp-weight').value,
    physician: document.getElementById('pp-physician').value.trim(),
    insurance: document.getElementById('pp-insurance').value.trim(),
    emergencyContact: document.getElementById('pp-emergency').value.trim()
  };
  localStorage.setItem('passport', JSON.stringify(passport));
  document.getElementById('pp-saved-note').textContent = '✓ Saved';
  setTimeout(function() { document.getElementById('pp-saved-note').textContent = ''; }, 2000);
}

function renderPassport() {
  const saved = JSON.parse(localStorage.getItem('passport') || '{}');
  populatePassportSelects();
  if (saved.bloodGroup) document.getElementById('pp-bloodgroup').value = saved.bloodGroup;
  if (saved.genotype) document.getElementById('pp-genotype').value = saved.genotype;
  document.getElementById('pp-allergies').value = saved.allergies || '';
  document.getElementById('pp-conditions').value = saved.conditions || '';
  document.getElementById('pp-history').value = saved.history || '';
  document.getElementById('pp-vaccinations').value = saved.vaccinations || '';
  document.getElementById('pp-height').value = saved.height || '';
  document.getElementById('pp-weight').value = saved.weight || '';
  document.getElementById('pp-physician').value = saved.physician || '';
  document.getElementById('pp-insurance').value = saved.insurance || '';
  document.getElementById('pp-emergency').value = saved.emergencyContact || '';
}

function buildPassportSummary() {
  const p = JSON.parse(localStorage.getItem('passport') || '{}');
  const name = localStorage.getItem('userName') || 'Sentra-X User';
  const meds = JSON.parse(localStorage.getItem('meds') || '[]');
  const medNames = meds.map(function(m) { return m.name; }).join(', ') || 'None listed';
  const lines = [
    'SENTRA-X MEDICAL PASSPORT',
    'Name: ' + name,
    'Blood Group: ' + (p.bloodGroup || 'Unknown'),
    'Genotype: ' + (p.genotype || 'Unknown'),
    'Allergies: ' + (p.allergies || 'None listed'),
    'Chronic Conditions: ' + (p.conditions || 'None listed'),
    'Current Medications: ' + medNames,
    'Height/Weight: ' + (p.height || '—') + 'cm / ' + (p.weight || '—') + 'kg',
    'Primary Physician: ' + (p.physician || 'Not listed'),
    'Emergency Contact: ' + (p.emergencyContact || 'Not listed'),
    'Vaccination History: ' + (p.vaccinations || 'Not listed')
  ];
  return lines.join('\n');
}

function generatePassportQR() {
  const box = document.getElementById('qr-box');
  box.innerHTML = '';
  const summary = buildPassportSummary();
  new QRCode(box, { text: summary, width: 200, height: 200, colorDark: '#0f172a', colorLight: '#ffffff' });
  document.getElementById('qr-hint').style.display = 'block';
}
