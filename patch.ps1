$dash = 'C:\Users\majna\Documents\Capstone\InternLink\src\app\dashboard\dashboard.html'
$side = 'C:\Users\majna\Documents\Capstone\InternLink\src\app\dashboard\student-sidebar\student-sidebar.component.html'

# Build replacement strings out of character codes so nothing is renderer-stripped
$gt  = [char]62    # >
$quot= [char]34    # "
$r   = [char]125   # }

# dashboard.html fixes ---------------------------------------------------------
$d = [System.IO.File]::ReadAllText($dash)
$fix1_old = '<app-student-sidebar</app-student-sidebar>'
$fix1_new = '<app-student-sidebar' + $gt +</app-student-sidebar>'
$d = $d.Replace($fix1_old, $fix1_new)

$fix2_old = '<router-outlet</router-outlet>'
$fix2_new = '<router-outlet' + $gt +</router-outlet>'
$d = $d.Replace($fix2_old, $fix2_new)

$fix3_old = 'class="h-2 w-2 rounded-full bg-emerald-500</span>'
$fix3_new = 'class="h-2 w-2 rounded-full bg-emerald-500' + $quot + $gt +</span>'
$d = $d.Replace($fix3_old, $fix3_new)

[System.IO.File]::WriteAllText($dash, $d, (New-Object System.Text.UTF8Encoding $false))

# student-sidebar.component.html fixes ---------------------------------------
$s = [System.IO.File]::ReadAllText($side)
$fix4_old = '{ item.label'
$fix4_new = '{ item.label ' + $r + $r
$s = $s.Replace($fix4_old, $fix4_new)

$fix5_old = 'animate-pulse</span>'
$fix5_new = 'animate-pulse' + $quot + $gt +</span>'
$s = $s.Replace($fix5_old, $fix5_new)

[System.IO.File]::WriteAllText($side, $s, (New-Object System.Text.UTF8Encoding $false))

Write-Host "=== dashboard.html ==="
Get-Content $dash
Write-Host ""
Write-Host "=== student-sidebar.component.html ==="
Get-Content $side
