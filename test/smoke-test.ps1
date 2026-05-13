$BASE = if ($env:API_URL) { $env:API_URL } else { "http://localhost:4000/v1" }
$pass = 0; $fail = 0; $skip = 0

function Check { param($name, $result, $detail)
  if ($result) { $script:pass++; Write-Host "  PASS: $name" -ForegroundColor Green }
  else { $script:fail++; Write-Host "  FAIL: $name${detail}: $detail" -ForegroundColor Red }
}

function Api { param($path, $Method="GET", $Body, $Headers=@{})
  try { return Invoke-RestMethod -Uri "$BASE$path" -Method $Method -ContentType "application/json" -Body $Body -Headers $Headers -ErrorAction Stop }
  catch { throw $_ }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  FIELDSERVICEIT E2E SMOKE TEST" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`n[1] AUTH" -ForegroundColor Yellow
try { $r = Api "/auth/login" POST '{"email":"admin@acme.com","password":"admin123"}'; $h = @{Authorization="Bearer $($r.accessToken)"}; $adminT = $r.accessToken; Check "Admin login" $true } catch { Check "Admin login" $false }
try { $r = Api "/auth/login" POST '{"email":"super@fieldserviceit.com","password":"admin123"}'; $superH = @{Authorization="Bearer $($r.accessToken)"}; Check "Super login" $true } catch { Check "Super login" $false }
try { Api "/auth/login" POST '{"email":"admin@acme.com","password":"wrong"}'; Check "Bad password reject" $false } catch { Check "Bad password reject" ($_.Exception.Response.StatusCode -eq 401) }

Write-Host "`n[2] HEALTH" -ForegroundColor Yellow
try { $r = Api "/health"; Check "Health endpoint" ($r.status -eq 'ok') } catch { Check "Health endpoint" $false }

Write-Host "`n[3] TICKETS" -ForegroundColor Yellow
try { $r = Api "/tickets" GET $null $h; Check "List tickets" ($r.data.Count -ge 0) } catch { Check "List tickets" $false }
try { $r = Api "/tickets?page=1&limit=10&status=OPEN" GET $null $h; Check "Tickets with params" ($r.meta.page -eq 1) } catch { Check "Tickets with params" $false }
try { $r = Api "/tickets" POST '{"title":"Smoke Test","priority":"HIGH","category":"Network","contactName":"Smoke Tester","contactEmail":"smoke@test.com","contactPhone":"555-0000"}' $h; $global:tid=$r.id; Check "Create ticket" ($r.ticketNumber -match '^TKT-') } catch { Check "Create ticket" $false }
try { Api "/tickets/$global:tid" GET $null $h; Check "Get ticket detail" $true } catch { Check "Get ticket detail" $false }
try { Api "/tickets/$global:tid" PATCH '{"status":"ASSIGNED"}' $h; Check "Status transition OPEN->ASSIGNED" $true } catch { Check "Status transition OPEN->ASSIGNED" $false }

Write-Host "`n[4] ASSETS" -ForegroundColor Yellow
try { $r = Api "/assets" GET $null $h; Check "List assets" ($r.data.Count -ge 0) } catch { Check "List assets" $false }
try { $r = Api "/assets?page=1&limit=10&search=WS" GET $null $h; Check "Assets with params" $true } catch { Check "Assets with params" $false }

Write-Host "`n[5] SEARCH" -ForegroundColor Yellow
try { $r = Api "/search?q=server" GET $null $h; Check "Search endpoint" ($r.tickets.Count -ge 0 -and $r.assets.Count -ge 0) } catch { Check "Search endpoint" $false }

Write-Host "`n[6] DISPATCH" -ForegroundColor Yellow
try { $r = Api "/dispatch" GET $null $h; Check "List dispatches" ($r.Count -ge 0) } catch { Check "List dispatches" $false }

Write-Host "`n[7] USERS" -ForegroundColor Yellow
try { $r = Api "/users/me" GET $null $h; Check "GET /users/me" ($r.email -eq 'admin@acme.com') } catch { Check "GET /users/me" $false }
try { Api "/users/me" PATCH '{"firstName":"Smoked"}' $h; Check "PATCH /users/me" $true } catch { Check "PATCH /users/me" $false }

Write-Host "`n[8] SETTINGS" -ForegroundColor Yellow
try { $r = Api "/settings" GET $null $h; Check "GET /settings" ($r -ne $null) } catch { Check "GET /settings" $false }

Write-Host "`n[9] ADMIN (SUPER)" -ForegroundColor Yellow
try { $r = Api "/admin/users?page=1&limit=10" GET $null $superH; Check "Admin list users" ($r.data.Count -ge 0) } catch { Check "Admin list users" $false }
try { $r = Api "/admin/companies?page=1&limit=10" GET $null $superH; Check "Admin list companies" ($r.data.Count -ge 0) } catch { Check "Admin list companies" $false }
try { $r = Api "/admin/audit-logs?page=1&limit=5" GET $null $superH; Check "Admin audit logs" ($r.data.Count -ge 0) } catch { Check "Admin audit logs" $false }
try { $r = Api "/admin/stats" GET $null $superH; Check "Admin stats" ($r -ne $null) } catch { Check "Admin stats" $false }
try { $r = Api "/admin/roles" GET $null $superH; Check "Admin roles" ($r.Count -ge 0) } catch { Check "Admin roles" $false }

Write-Host "`n[10] TENANT ADMIN" -ForegroundColor Yellow
try { $r = Api "/admin/company/users?page=1&limit=10" GET $null $h; Check "Company users" ($r.data.Count -ge 0) } catch { Check "Company users" $false }

Write-Host "`n[11] REPORTS" -ForegroundColor Yellow
try { $r = Api "/reports/tickets" GET $null $h; Check "Reports tickets" ($r -ne $null) } catch { Check "Reports tickets" $false }

Write-Host "`n[12] RMM INTEGRATION" -ForegroundColor Yellow
try { $r = Api "/integrations/rmm/providers" GET $null $h; Check "RMM providers" ($r.providers.Count -eq 3) } catch { Check "RMM providers" $false }
try { $r = Api "/integrations/rmm/sync-asset" POST '{"provider":"connectwise","assetData":{"name":"Smoke-CW","assetType":"SERVER"}}' $h; Check "RMM sync asset" ($r.name -eq 'Smoke-CW') } catch { Check "RMM sync asset" $false }
try { $r = Api "/integrations/rmm/alert" POST '{"provider":"ninjaone","alert":{"title":"Smoke Alert","severity":"critical"}}' $h; Check "RMM create alert ticket" ($r.title -match 'ninjaone') } catch { Check "RMM create alert ticket" $false }
try { $r = Api "/integrations/rmm/configs" POST '{"provider":"datto","credentials":{"apiToken":"t","siteId":"s"}}' $h; Check "RMM save config" ($r.id -ne $null) } catch { Check "RMM save config" $false }
try { $r = Api "/integrations/rmm/configs" GET $null $h; Check "RMM list configs" ($r.Count -ge 1) } catch { Check "RMM list configs" $false }
try { $r = Api "/integrations/rmm/sync-now/connectwise" POST $null $h; Check "RMM sync now" ($r.synced -eq $true) } catch { Check "RMM sync now" $false }

Write-Host "`n[13] UPLOAD VALIDATION" -ForegroundColor Yellow
$boundary = [Guid]::NewGuid().ToString()
$fileBody = "--$boundary`r`nContent-Disposition: form-data; name=`"avatar`"; filename=`"test.txt`"`r`nContent-Type: text/plain`r`n`r`nnot an image`r`n--$boundary--`r`n"
try {
  Invoke-RestMethod -Uri "$BASE/uploads/avatar" -Method Post -Headers (@{Authorization=$h['Authorization']; "Content-Type"="multipart/form-data; boundary=$boundary"}) -Body $fileBody -ErrorAction Stop
  Check "Reject non-image avatar" $false
} catch { Check "Reject non-image avatar" ($_.Exception.Response.StatusCode -in @(413,422,400)) }

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  RESULTS:  PASS=$pass  FAIL=$fail  TOTAL=$($pass+$fail)" -ForegroundColor $(if ($fail -eq 0) {"Green"} else {"Red"})
Write-Host "========================================" -ForegroundColor Cyan
exit $fail
