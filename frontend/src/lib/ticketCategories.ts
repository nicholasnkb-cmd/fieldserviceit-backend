export const categories: Record<string, string[]> = {
  Hardware: ['Workstation', 'Laptop', 'Printer', 'Server', 'Peripheral', 'Mobile Device', 'Other'],
  Software: ['OS/Windows', 'Microsoft 365', 'ERP/CRM', 'Antivirus', 'Database', 'Custom App', 'Other'],
  Network: ['Connectivity', 'VPN', 'Wi-Fi', 'Firewall', 'DNS/DHCP', 'VoIP', 'Other'],
  'Account/Access': ['Password Reset', 'New Account', 'Permission Change', 'MFA', 'SSO', 'Other'],
  Facility: ['Power', 'HVAC', 'Security', 'Office Furniture', 'Cleaning', 'Other'],
  Other: ['General Inquiry', 'Maintenance', 'Vendor', 'Documentation', 'Other'],
};

export const allCategories = Object.keys(categories);
