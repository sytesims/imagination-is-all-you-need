-- The Imagination Mac app (compiled by scripts/make-mac-app.sh). All the work is in Contents/Resources/launch.sh;
-- this shows it as a real Dock app with native dialogs. Hold Option while opening it to stop Imagination instead.
use AppleScript version "2.4"
use framework "AppKit"
use scripting additions

on run
	set optionKey to ((current application's NSEvent's modifierFlags()) as integer) div 524288 mod 2 = 1
	if optionKey then
		askToStop()
	else
		openImagination()
	end if
end run

on reopen
	openImagination()
end reopen

on launcher()
	return quoted form of (POSIX path of (path to me) & "Contents/Resources/launch.sh")
end launcher

on openImagination()
	try
		-- notifications come from this app (with its icon), so the launcher's own are turned off
		set wasRunning to (do shell script launcher() & " --status") is "running"
		if not wasRunning then display notification "Starting Imagination…" with title "Imagination"
		do shell script "IMAGINATION_NO_NOTIFY=1 " & launcher()
		if not wasRunning then display notification "Imagination is ready" with title "Imagination"
	on error msg
		set logPath to POSIX path of (path to library folder from user domain) & "Logs/Imagination/app.log"
		set picked to button returned of (display dialog msg with title "Imagination" buttons {"Show log", "OK"} default button "OK" with icon caution)
		if picked is "Show log" then do shell script "open -R " & quoted form of logPath & " || true"
	end try
end openImagination

on askToStop()
	set picked to button returned of (display dialog "Stop Imagination? The studio closes in your browser until you open it again." with title "Imagination" buttons {"Cancel", "Open", "Stop Imagination"} default button "Open" cancel button "Cancel")
	if picked is "Open" then
		openImagination()
	else
		try
			display dialog (do shell script launcher() & " --stop") with title "Imagination" buttons {"OK"} default button "OK"
		on error msg
			display dialog msg with title "Imagination" buttons {"OK"} default button "OK"
		end try
	end if
end askToStop
