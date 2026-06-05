$ErrorActionPreference = "Stop"

$ghDir = "d:\fp tegraf\graphhopper"
if (!(Test-Path $ghDir)) { New-Item -ItemType Directory -Force -Path $ghDir | Out-Null }

cd $ghDir

Write-Host "Downloading Portable JRE 21..."
$jreUrl = "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.3%2B9/OpenJDK21U-jre_x64_windows_hotspot_21.0.3_9.zip"
$jreZip = "$ghDir\jre.zip"
if (!(Test-Path $jreZip)) {
    Invoke-WebRequest -Uri $jreUrl -OutFile $jreZip
}

Write-Host "Extracting JRE..."
$javaDir = "$ghDir\jdk-21.0.3+9-jre"
if (!(Test-Path $javaDir)) {
    Expand-Archive -Path $jreZip -DestinationPath $ghDir -Force
}

Write-Host "Downloading GraphHopper 8.0..."
$ghUrl = "https://repo1.maven.org/maven2/com/graphhopper/graphhopper-web/8.0/graphhopper-web-8.0.jar"
$ghJar = "$ghDir\graphhopper.jar"
if (!(Test-Path $ghJar)) {
    Invoke-WebRequest -Uri $ghUrl -OutFile $ghJar
}

Write-Host "Downloading Java OSM Data (~160MB)..."
$osmUrl = "https://download.geofabrik.de/asia/indonesia/java-latest.osm.pbf"
$osmFile = "$ghDir\java-latest.osm.pbf"
if (!(Test-Path $osmFile)) {
    Invoke-WebRequest -Uri $osmUrl -OutFile $osmFile
}

Write-Host "Setup Completed Successfully!"
