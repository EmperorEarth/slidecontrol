

// variables
let path = window.location.pathname,
	Socket = null,
	laserpointerX = 100,
	laserpointerY = 100,
	_laserpointerX = 0,
	_laserpointerY = 0

// Logger for info and errors
const Logger = {
	log: log => console.log("[slidecontrol]", log),
	error: error => console.error("[slidecontrol error]", error)
}

/**
 * Parse meta-information about presentation from google defined variable "viewerData"
 */
const getPresentationInfo = function () {

	Logger.log("getting Presentation Information...")
	
	// create script in google HTML
	let script = document.createElement("script")
	
	// make script put json from viewerData in "global" variable as body attribute
	script.textContent = "document.querySelector('body').setAttribute('viewerData', JSON.stringify(viewerData))"
	
	// place script
	document.body.appendChild(script)
	
	// get info now and remove script again
	let presentationInfo = JSON.parse(document.body.getAttribute("viewerData"))
	script.remove()
	document.body.removeAttribute("viewerData")
	return presentationInfo
}

/**
 * Register slide to server
 */
const registerSlide = () => {
	let code = Math.floor(Math.random() * 100000)

	if (!code) registerSlide()
    if (isNaN(code)) registerSlide()
	if (code < 1000 || code > 99999) registerSlide()
	
	Logger.log("Generated ID for slide: #" + code)

	let googleSlideButton = document.querySelector(".goog-flat-menu-button-caption"), // Google button containing further info about slide
		presentationInfo = getPresentationInfo(), // first get info about slide
		activeSlide = parseInt(googleSlideButton.getAttribute("aria-posinset")), // current Slide
		totalSlides = parseInt(googleSlideButton.getAttribute("aria-setsize")), // total Slides
		notes = presentationInfo.docData[1][activeSlide - 1][9], // notes as HTML
		title = document.querySelector('[property="og:title"]').content // title of presentation

	Socket.send(JSON.stringify({
		reason: 'new-slide',
		code,
		title,
		notes,
		activeSlide,
		totalSlides
	}))
}

/**
 * Runs whenever message from server is recieved
 * @param {Object} message message from server
 */
const handleMessage = message => {
	Logger.log('recieved message: ' + message.reason)
	if (!message || !message.reason) return

	if (message.reason === "error-slide-code-taken") registerSlide()
	if (message.reason === "slide-created") startSlidecontrol(message.code)
	if (message.reason === "next-slide") switchSlide("next")
	if (message.reason === "previous-slide") switchSlide("back")
	if (message.reason === "new-device-synced") chrome.runtime.sendMessage("New device synced to slide: #" + message.code)

	if (message.reason === "laserpointer-down") document.querySelector("#laserpointer").style.opacity = "1"

	if (message.reason === "laserpointer-move") {
		let laserpointer = document.querySelector("#laserpointer")
		if (laserpointerX + message.x < 0) laserpointerX = 0
		if (laserpointerY + message.y < 0) laserpointery = 0
		laserpointer.style.left = `${laserpointerX + message.x * 3}px`
		laserpointer.style.top = `${laserpointerY + message.y * 3}px`
		_laserpointerX = message.x * 3
		_laserpointerY = message.y * 3
	}
	
	if (message.reason === "laserpointer-up") {
		laserpointerX = laserpointerX + _laserpointerX
		laserpointerY = laserpointerY + _laserpointerY
		document.querySelector("#laserpointer").style.opacity = "0.3"
	}
}

/**
 * Add button to start slidecontrol
 */
const main = function () {

	Logger.log("Adding slidecontrol button...")

	// create div to be put into the control-thingy in the presentation
	let googleSlideController = document.querySelector(".punch-viewer-nav-rounded-container")
	let slidecontrolProxy = document.createElement("div")

	slidecontrolProxy.className = "goog-inline-block goog-flat-button"
	slidecontrolProxy.style.margin = "0 4px"
	slidecontrolProxy.style.padding = "0"

	slidecontrolProxy.innerHTML = 	'<div class="goog-toolbar-separator goog-toolbar-separator-disabled goog-inline-block"></div>' + // the devider
									
									// start slidecontrol button
									'<div class="goog-inline-block goog-flat-button" id="slidecontrol-start-block">' +
										'<div class="punch-viewer-captioned-button" id="slidecontrol-start-button">' +
											'<div style="width:24px; height:24px; background-image:url(https://i.ibb.co/YPnSnLP/logo-ohnekontur-1.png); filter:grayscale(100); background-size:contain; background-position:center; background-repeat:no-repeat;">' +
											'</div>' +
											'<div class="punch-viewer-speaker-notes-text goog-inline-block">' +
												'Start slidecontrol' +
											'</div>' +
										'</div>' + 
									'</div>' +
									
									// gets rendered after slidecontrol started
									'<div id="slidecontrol-id-block" class="goog-inline-block goog-flat-button" style="display: none; text-align: center; line-height: 16px; cursor: text;">' +
										'<div>Your ID:</div>' +
										'<div id="slidecontrol-id-text" style="font-size: 16px; font-weight: 600;" />' +
									'</div>'

	googleSlideController.appendChild(slidecontrolProxy)

	// user starts slidecontrol:
	document.querySelector("#slidecontrol-start-button").addEventListener("click", initializeSlidecontrol)

}

const initializeSlidecontrol = () => {
	console.log('Initializing slidecontrol...')

	Socket = new WebSocket('wss://www.maniyt.de:61263')

	Socket.onopen = () => {
		registerSlide()
		Socket.onmessage = message => handleMessage(JSON.parse(message.data))
	}

	Socket.onerror = error => {
		console.error(error)
		alert("Error in slidecontrol: socket-error-connection")
		location.reload()
	}
}

const startSlidecontrol = code => {
	Logger.log("Started Slidecontrol with id #" + code)

	// show notification with slide ID
	chrome.runtime.sendMessage("Your code for this slide is " + code)

	let startButton = document.querySelector("#slidecontrol-start-block"),
		idContainer = document.querySelector("#slidecontrol-id-block"),
		idText = document.querySelector("#slidecontrol-id-text"),
		slideWrapper = document.querySelector(".punch-viewer-content")

	// hide the start button and show the ID
	startButton.style.display = "none"
	idContainer.style.display = "inline-block"
	idText.innerHTML = code

	let googleSlideButton = document.querySelector(".goog-flat-menu-button-caption") // Google button containing further info about slide

	// in order to detect change of slides
	const observer = new MutationObserver(() => {

		Logger.log("Observed slide-change")

		// update position and notes in firestore
		let currentSlide = parseInt(googleSlideButton.getAttribute("aria-posinset"))
			notes = getPresentationInfo().docData[1][currentSlide - 1][9]
		
		Socket.send(JSON.stringify({
			reason: "slide-changed",
			currentSlide,
			notes
		}))

	})
	
	// observe change of the button containing current slide number
	observer.observe(googleSlideButton, {
		attributes: true
	})

	let laserpointer = document.createElement("div")

	laserpointer.id = "laserpointer"
	laserpointer.style = 	"position: relative;" +
												"width: 10px;" +
												"height: 10px;" +
												"transition: opacity .25s;" +
												"background: red;" +
												"border-radius: 5px;" +
												"box-shadow: 0px 1px 3px 0px rgba(0, 0, 0, .87);" +
												"z-index: 5;" +
												"bottom: 100px;" +
												"left: 100px"

	slideWrapper.insertBefore(laserpointer, slideWrapper.firstChild)
}

/**
 * switch the current slide (next or previous)
 * @param {String} direction either "next" or "previous"
 */
const switchSlide = function (direction) {

	Logger.log("Switching slides in direction: " + direction)

	// depending on direction change mousewheel's direction to either up (-120) or down (120)
	const mousewheelDelta = direction === "next" ? -120 : 120

	// create script which emits mousewheel event in given direction
	let script = document.createElement("script")
	script.textContent = "(" + function (mouseWheelDelta) {
		let googleSlideContainer = document.querySelector(".punch-viewer-container")
		let event = document.createEvent("Event")
		event.initEvent("mousewheel", true, false)
		event.wheelDelta = mouseWheelDelta
		googleSlideContainer.dispatchEvent(event)
	} + ')("' + mousewheelDelta + '")'

	// place script and remove it right after :O
	document.body.appendChild(script)
	script.remove()
}

// only run all the stuff here if we are on an opened google slide
if (path.includes("/presentation/d/")) {

	Logger.log("Slidecontrol got evoked")

	const trimmedPath = path.replace("/presentation/d/", "")

	// we are in editing mode so create our lovely button
	if (trimmedPath.includes("/edit"))  {

		Logger.log("In edit-mode")

		// create stylesheet for button
		let stylesheet = document.createElement("style")
		stylesheet.innerHTML = 	"#slidecontrol-open-presentation-button {" +
									"text-decoration: none !important}" +
								"#slidecontrol-open-presentation-button-text {" +
									"cursor: pointer;" +
									"background-image: none;" +
									"border-radius: 4px;" +
									"box-shadow: none;" +
									"box-sizing: border-box;" +
									"font-family: var(--docs-material-header-font-family,Roboto,RobotoDraft,Helvetica,Arial,sans-serif);" +
									"font-weight: var(--docs-material-font-weight-bold,500);" +
									"font-size: 14px;" +
									"height: 36px;" +
									"letter-spacing: 0.25px;" +
									"line-height: 16px;" +
									"background: white;" +
									"border: 1px solid #dadce0!important;" +
									"color: #202124;" +
									"padding: 9px 11px 10px 12px}" +
								"#slidecontrol-open-presentation-button-text:hover {" +
									"border: 1px solid #feedbc!important;" +
									"background: #fffdf6}"

		// place stylesheet
		document.head.appendChild(stylesheet)

		// get the google slides button and create new one
		let googleSlideController = document.querySelector(".punch-start-presentation-container"),
				openPresentationButton = document.createElement("a"),
				openPresentationButtonText = document.createElement("div")

		// initialize button to open presentation in new tab
		openPresentationButton.className = "punch-start-presentation-container"
		openPresentationButton.id = "slidecontrol-open-presentation-button"
		openPresentationButton.target = "_blank"
		openPresentationButton.href = window.location.href.replace("edit", "present")

		// add some google-made stylinng too
		openPresentationButtonText.className = "goog-inline-block jfk-button jfk-button-standard jfk-button-collapse-right docs-titlebar-button jfk-button-clear-outline"
		openPresentationButtonText.innerHTML = "slidecontrol"
		openPresentationButtonText.id = "slidecontrol-open-presentation-button-text"

		// place button
		openPresentationButton.appendChild(openPresentationButtonText)
		googleSlideController.before(openPresentationButton)

	}

	// we are in presentation mode, so initilize slidecontrol
	if (trimmedPath.includes("/present")) {
		Logger.log("In presentation-mode")
		main()
	}
}