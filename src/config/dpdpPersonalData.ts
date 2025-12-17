export const DPDP_PERSONAL_DATA = {
    IDENTITY: ['full_name', 'first_name', 'last_name', 'username', 'photo', 'name', 'gender'],
    CONTACT: ['email', 'phone', 'mobile', 'whatsapp', 'contact'],
    GOVERNMENT_ID: ['aadhaar', 'pan', 'passport', 'voter_id', 'driving_license', 'gstin'],
    FINANCIAL: ['bank_account', 'ifsc', 'credit_card', 'debit_card', 'upi', 'account_number', 'cvv'],
    LOCATION: ['address', 'city', 'state', 'pincode', 'ip_address', 'country', 'zip'],
    HEALTH: ['medical_record', 'diagnosis', 'insurance', 'health'],
    CHILDREN: ['child_name', 'age', 'school', 'minor'],
    EMPLOYEE: ['employee_id', 'salary', 'payroll', 'designation'],
    DIGITAL: ['device_id', 'cookies', 'session_id', 'mac_address'],
    BEHAVIORAL: ['purchase_history', 'preferences']
};

export type DPDP_CATEGORY = keyof typeof DPDP_PERSONAL_DATA;
