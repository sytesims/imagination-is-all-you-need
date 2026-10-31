-- The Imagination Mac app (compiled by scripts/make-mac-app.sh as a stay-open applet). All the work is in
-- Contents/Resources/launch.sh; this shows it as a real Dock app with native dialogs:
--   opening it starts Imagination when it isn't running and opens it in the browser; it then stays open (the Dock shows
--   it running) and checks every 5 seconds that Imagination still answers. Clicking it again opens the browser again.
--   Quitting it asks whether to stop Imagination too (only a copy it started; one started in a terminal keeps running).
--   Holding Option while opening it offers to stop Imagination straight away (also when this app couldn't open it).
use AppleScript version "2.4"
use framework "AppKit"
use scripting additions

property quitQuietly : false -- quit without asking (Imagination stopped by itself, or never started)
property downChecks : 0 -- checks in a row that found Imagination not answering
property openedAt : missing value -- when the browser was last opened (a click made while starting arrives right after)

on run
	-- (a signed applet never saves these, but start clean anyway)
	set quitQuietly to false
	set downChecks to 0
	set openedAt to missing value
	set optionKey to ((current application's NSEvent's modifierFlags()) as integer) div 524288 mod 2 = 1
	if optionKey then
		set quitQuietly to true
		try
			askToStop() -- (Cancel ends up here too)
		end try
		if quitQuietly then
			quit
			return
		end if
	end if
	if not openImagination() then
		set quitQuietly to true
		quit
	end if
end run

on reopen
	-- a click made while it was starting is only delivered now: the browser was just opened for it
	if openedAt is not missing value and ((current date) - openedAt) < 3 then return
	if not openImagination() then
		set quitQuietly to true
		quit
	end if
end reopen

on idle
	set state to "stopped"
	try
		set state to do shell script launcher() & " --status"
	end try
	if state is "stopped" then
		set downChecks to downChecks + 1
		-- about a minute with nothing on its ports: an update or a reload restarts the servers for a while, that's not stopping
		if downChecks ≥ 12 then
			display notification "Imagination stopped. Open it again to start it." with title "Imagination"
			set quitQuietly to true
			quit
		end if
	else
		set downChecks to 0
	end if
	return 5
end idle

on quit
	set state to "stopped"
	if not quitQuietly and not systemQuit() then
		try
			set state to do shell script launcher() & " --status"
		end try
	end if
	if state is not "stopped" then
		try
			set picked to button returned of (display dialog "Stop Imagination too? It closes in your browser until you open it again." with title "Imagination" buttons {"Keep running", "Stop"} default button "Keep running" giving up after 60)
		on error number -128
			return -- Escape: don't quit
		end try
		if picked is "Stop" then
			try
				do shell script launcher() & " --stop"
			on error msg
				display dialog msg with title "Imagination" buttons {"OK"} default button "OK" giving up after 60
			end try
		end if
	end if
	continue quit
end quit

on launcher()
	return quoted form of (POSIX path of (path to me) & "Contents/Resources/launch.sh")
end launcher

-- opens Imagination (starting it when needed); false when it couldn't (after saying why)
on openImagination()
	try
		-- notifications come from this app (with its icon), so the launcher's own are turned off
		set wasRunning to (do shell script launcher() & " --status") is "running"
		if not wasRunning then display notification "Starting Imagination…" with title "Imagination"
		set out to do shell script "IMAGINATION_NO_NOTIFY=1 " & launcher()
		set openedAt to current date
		set downChecks to 0
		-- (out says "already starting" when another copy of this app is starting it: that one opens the browser)
		if not wasRunning and out is "" then display notification "Imagination is ready" with title "Imagination"
		return true
	on error msg
		set logPath to POSIX path of (path to library folder from user domain) & "Logs/Imagination/app.log"
		set picked to button returned of (display dialog msg with title "Imagination" buttons {"Show log", "OK"} default button "OK" with icon caution)
		if picked is "Show log" then do shell script "open -R " & quoted form of logPath & " || true"
		return false
	end try
end openImagination

-- Option held while opening: Stop, or Open as usual (which then keeps the app open)
on askToStop()
	set picked to button returned of (display dialog "Stop Imagination? It closes in your browser until you open it again." with title "Imagination" buttons {"Cancel", "Open", "Stop Imagination"} default button "Open" cancel button "Cancel")
	if picked is "Open" then
		set quitQuietly to false
	else
		try
			display dialog (do shell script launcher() & " --stop") with title "Imagination" buttons {"OK"} default button "OK"
		on error msg
			display dialog msg with title "Imagination" buttons {"OK"} default button "OK"
		end try
	end if
end askToStop

-- true when the system asks every app to quit (log out, restart, shut down): never hold that up with a question
on systemQuit()
	try
		set ev to current application's NSAppleEventManager's sharedAppleEventManager()'s currentAppleEvent()
		if ev is missing value then return false
		set why to ev's attributeDescriptorForKeyword:2.003331391E+9 -- 'why?', the quit reason
		return why is not missing value
	on error
		return false
	end try
end systemQuit
