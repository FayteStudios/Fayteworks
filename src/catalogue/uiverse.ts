import type { CatalogueItem } from "./types";

export const uiverseItems: CatalogueItem[] = [
  {
    "id": "uiverse-message-button",
    "name": "Message icon button",
    "category": "Buttons",
    "tags": [
      "button",
      "icon",
      "blue",
      "animated"
    ],
    "size": {
      "w": 3,
      "h": 3
    },
    "html": "<a class=\"button\" href=\"{{link}}\">\n  <svg class=\"svg-icon\" fill=\"none\" height=\"22\" viewBox=\"0 0 20 20\" width=\"22\" xmlns=\"http://www.w3.org/2000/svg\"><g stroke=\"#fff\" stroke-linecap=\"round\" stroke-width=\"1.5\"><path d=\"m6.66669 6.66667h6.66671\"></path><path clip-rule=\"evenodd\" d=\"m3.33331 5.00001c0-.92047.74619-1.66667 1.66667-1.66667h10.00002c.9205 0 1.6666.7462 1.6666 1.66667v6.66669c0 .9205-.7461 1.6666-1.6666 1.6666h-4.8274c-.1105 0-.21654.044-.29462.122l-2.50004 2.5c-.26249.2625-.71129.0766-.71129-.2945v-1.9108c0-.2301-.18655-.4167-.41667-.4167h-1.25c-.92048 0-1.66667-.7461-1.66667-1.6666z\" fill-rule=\"evenodd\"></path><path d=\"m6.66669 10h2.5\"></path></g></svg>\n  <span class=\"lable\">{{label}}</span>\n</a>",
    "css": "/* From Uiverse.io by andrew-demchenk0 - Tags: animation, blue, button, message */\n.button {\n  text-decoration: none;\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  padding: 6px 12px;\n  gap: 8px;\n  height: 32px;\n  width: 124px;\n  border: none;\n  background: #056bfae0;\n  border-radius: 20px;\n  cursor: pointer;\n}\n\n.lable {\n  line-height: 20px;\n  font-size: 17px;\n  color: #fff;\n  font-family: sans-serif;\n  letter-spacing: 1px;\n}\n\n.button:hover {\n  background: #056DFA;\n}\n\n.button:hover .svg-icon {\n  animation: msg 2s linear infinite;\n}\n\n@keyframes msg {\n  0% {\n    transform: translate(0, 0) scale(1);\n  }\n\n  15% {\n    transform: translateX(1px);\n  }\n\n  30% {\n    transform: scale(1.1);\n  }\n\n  45% {\n    transform: translateY(1px);\n  }\n\n  60% {\n    transform: translateY(0px);\n  }\n\n  75% {\n    transform: scale(1);\n  }\n\n  90% {\n    transform: translateX(-px);\n  }\n\n  100% {\n    transform: translate(0, 0) scale(1);\n  }\n}",
    "slots": [
      {
        "key": "label",
        "label": "Label",
        "kind": "text",
        "value": "Message"
      },
      {
        "key": "link",
        "label": "Link",
        "kind": "link",
        "value": "#"
      }
    ],
    "source": {
      "library": "Uiverse",
      "author": "andrew-demchenk0",
      "url": "https://github.com/uiverse-io/galaxy/blob/main/Buttons/andrew-demchenk0_strange-starfish-32.html",
      "licence": "MIT",
      "copyright": "Copyright (c) 2023 Uiverse.io",
      "changes": "The button is a link; its text and target are editable."
    }
  },
  {
    "id": "uiverse-gradient-pill",
    "name": "Gradient sweep pill button",
    "category": "Buttons",
    "tags": [
      "button",
      "gradient",
      "hover"
    ],
    "size": {
      "w": 3,
      "h": 3
    },
    "dark": true,
    "html": "<a class=\"button\" href=\"{{link}}\">{{label}}</a>",
    "css": "/* From Uiverse.io by KhaledMatalkah - Tags: button, gradients */\n.button {\n  display: inline-block;\n  padding: 15px 32px;\n  font-size: 17px;\n  font-weight: bold;\n  color: rgb(0, 0, 0);\n  background-color: rgb(255, 255, 255);\n  border: none;\n  border-radius: 50px;\n  text-align: center;\n  text-decoration: none;\n  cursor: pointer;\n  position: relative;\n  overflow: hidden;\n  z-index: 1;\n}\n\n.button:before,\n.button:after {\n  content: \"\";\n  position: absolute;\n  top: 0;\n  width: 100%;\n  height: 100%;\n  border-radius: 50px;\n  opacity: 0.3;\n  pointer-events: none;\n  transition: all 0.3s ease-in-out;\n}\n\n.button:before {\n  left: -100%;\n  background: linear-gradient(90deg, rgba(0, 136, 255, 0.8), rgba(255, 0, 170, 0.8), rgba(0, 136, 255, 0.8));\n  z-index: -1;\n}\n\n.button:hover:before {\n  left: 0;\n}\n\n.button:after {\n  right: -100%;\n  background: linear-gradient(270deg, rgba(0, 136, 255, 0.8), rgba(255, 0, 170, 0.8), rgba(0, 136, 255, 0.8));\n  z-index: -1;\n}\n\n.button:hover:after {\n  right: 0;\n}\n\n.button:hover {\n  transform: translateY(-2px);\n  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);\n}\n\n.button:active {\n  transform: translateY(1px);\n  box-shadow: none;\n}",
    "slots": [
      {
        "key": "label",
        "label": "Label",
        "kind": "text",
        "value": "Button"
      },
      {
        "key": "link",
        "label": "Link",
        "kind": "link",
        "value": "#"
      }
    ],
    "source": {
      "library": "Uiverse",
      "author": "KhaledMatalkah",
      "url": "https://github.com/uiverse-io/galaxy/blob/main/Buttons/KhaledMatalkah_tough-rat-6.html",
      "licence": "MIT",
      "copyright": "Copyright (c) 2023 Uiverse.io",
      "changes": "The button is a link; its text and target are editable."
    }
  },
  {
    "id": "uiverse-signup-arrow",
    "name": "Sign-up arrow button",
    "category": "Buttons",
    "tags": [
      "button",
      "gradient",
      "arrow",
      "hover"
    ],
    "size": {
      "w": 3,
      "h": 3
    },
    "html": "<a class=\"signupBtn\" href=\"{{link}}\">\n  {{label}}\n  <span class=\"arrow\">\n     <svg xmlns=\"http://www.w3.org/2000/svg\" height=\"1em\" viewBox=\"0 0 320 512\" fill=\"rgb(183, 128, 255)\"><path d=\"M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z\"></path></svg>\n  </span>\n</a>",
    "css": "/* From Uiverse.io by vinodjangid07 - Tags: gradient, button, hover effect, sign up */\n.signupBtn {\n  text-decoration: none;\n  width: 120px;\n  height: 40px;\n  border-radius: 30px;\n  border: none;\n  display: flex;\n  align-items: center;\n  justify-content: flex-start;\n  padding-left: 20px;\n  gap: 9px;\n  color: white;\n  background: linear-gradient(to right,rgb(128, 128, 255),rgb(183, 128, 255));\n  position: relative;\n  cursor: pointer;\n  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.212);\n}\n\n.arrow {\n  position: absolute;\n  right: 7.5px;\n  background-color: rgb(255, 255, 255);\n  width: 25px;\n  height: 25px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  border-radius: 50%;\n}\n\n.signupBtn:hover .arrow {\n  animation: slide-in-left 0.7s cubic-bezier(0.250, 0.460, 0.450, 0.940) both;\n}\n\n@keyframes slide-in-left {\n  0% {\n    transform: translateX(-10px);\n    opacity: 0;\n  }\n\n  100% {\n    transform: translateX(0);\n    opacity: 1;\n  }\n}",
    "slots": [
      {
        "key": "label",
        "label": "Label",
        "kind": "text",
        "value": "SIGN UP"
      },
      {
        "key": "link",
        "label": "Link",
        "kind": "link",
        "value": "#"
      }
    ],
    "source": {
      "library": "Uiverse",
      "author": "vinodjangid07",
      "url": "https://github.com/uiverse-io/galaxy/blob/main/Buttons/vinodjangid07_fluffy-sheep-17.html",
      "licence": "MIT",
      "copyright": "Copyright (c) 2023 Uiverse.io",
      "changes": "The button is a link; its text and target are editable."
    }
  },
  {
    "id": "uiverse-material-card",
    "name": "Material info card",
    "category": "Cards",
    "tags": [
      "card",
      "material",
      "light"
    ],
    "size": {
      "w": 4,
      "h": 16
    },
    "html": "<div class=\"card\">\n<div class=\"header\"></div>\n<div class=\"info\">\n  <p class=\"title\">{{title}}</p>\n  <p>{{text}}</p>\n</div>\n<div class=\"footer\">\n  <p class=\"tag\">{{tag}}</p>\n  <a class=\"action\" href=\"{{link}}\">{{button}}</a>\n</div>\n</div>",
    "css": "/* From Uiverse.io by Yaya12085 - Tags: card */\n.card {\n  display: flex;\n  flex-direction: column;\n  justify-content: space-between;\n  border-radius: 0.75rem;\n  background-color: white;\n  width: 300px;\n  height: 370px;\n  box-shadow: 0 4px 6px -1px rgba(0,0,0,.1),\n  0 2px 4px -2px rgba(0,0,0,.1);\n}\n\n.header {\n  position: relative;\n  background-clip: border-box;\n  margin-top: 1.5rem;\n  margin-left: 1rem;\n  margin-right: 1rem;\n  border-radius: 0.75rem;\n  background-color: rgb(33 150 243);\n  box-shadow: 0 10px 15px -3px rgba(33,150,243,.4),0 4px 6px -4px rgba(33,150,243,.4);\n  height: 14rem;\n}\n\n.info {\n  border: none;\n  padding: 1.5rem;\n  text-align: center;\n}\n\n.title {\n  color: rgb(38 50 56);\n  letter-spacing: 0;\n  line-height: 1.375;\n  font-weight: 600;\n  font-size: 1.25rem;\n  margin-bottom: 0.5rem;\n}\n\n.footer {\n  padding: 0.75rem;\n  border: 1px solid rgb(236 239 241);\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  background-color: rgba(0, 140, 255, 0.082);\n}\n\n.tag {\n  font-weight: 300;\n  font-size: .75rem;\n  display: block;\n}\n\n.action {\n  text-decoration: none;\n  -webkit-user-select: none;\n  -moz-user-select: none;\n  user-select: none;\n  border: none;\n  outline: none;\n  box-shadow: 0 4px 6px -1px rgba(33,150,243,.4),0 2px 4px -2px rgba(33,150,243,.4);\n  color: rgb(255 255 255);\n  text-transform: uppercase;\n  font-weight: 700;\n  font-size: .75rem;\n  padding: 0.75rem 1.5rem;\n  background-color: rgb(33 150 243);\n  border-radius: 0.5rem;\n}",
    "slots": [
      {
        "key": "title",
        "label": "Title",
        "kind": "text",
        "value": "How to make this material card ?"
      },
      {
        "key": "text",
        "label": "Text",
        "kind": "textarea",
        "value": "Lorem ipsum dolor sit amet consectetur adipisicing elit. Maxime mollitia, molestiae quas vel sint commodi."
      },
      {
        "key": "tag",
        "label": "Tags",
        "kind": "text",
        "value": "#HTML #CSS"
      },
      {
        "key": "button",
        "label": "Button label",
        "kind": "text",
        "value": "Get started"
      },
      {
        "key": "link",
        "label": "Link",
        "kind": "link",
        "value": "#"
      }
    ],
    "source": {
      "library": "Uiverse",
      "author": "Yaya12085",
      "url": "https://github.com/uiverse-io/galaxy/blob/main/Cards/Yaya12085_hard-mole-83.html",
      "licence": "MIT",
      "copyright": "Copyright (c) 2023 Uiverse.io",
      "changes": "Text made editable. The button is a link."
    }
  },
  {
    "id": "uiverse-dark-glow-card",
    "name": "Dark glow hover card",
    "category": "Cards",
    "tags": [
      "card",
      "dark",
      "hover",
      "shadow"
    ],
    "size": {
      "w": 4,
      "h": 12
    },
    "dark": true,
    "html": "<div class=\"card\">\n  <div class=\"content\">\n    <p class=\"heading\">{{title}}</p><p class=\"para\">{{text}}</p>\n    <a class=\"btn\" href=\"{{link}}\">{{button}}</a>\n  </div>\n</div>",
    "css": "/* From Uiverse.io by gharsh11032000 - Tags: card, shadow, hover effect */\n.card {\n  position: relative;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 320px;\n  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);\n  padding: 32px;\n  overflow: hidden;\n  border-radius: 10px;\n  background: #212121;\n  border: 2px solid #313131;\n  transition: all 0.5s cubic-bezier(0.23, 1, 0.320, 1);\n}\n\n.content {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-start;\n  gap: 20px;\n  color: #e8e8e8;\n  transition: all 0.5s cubic-bezier(0.23, 1, 0.320, 1);\n}\n\n.content .heading {\n  font-weight: 700;\n  font-size: 32px;\n}\n\n.content .para {\n  line-height: 1.5;\n}\n\n.content .btn {\n  color: #e8e8e8;\n  text-decoration: none;\n  padding: 10px;\n  font-weight: 600;\n  border: none;\n  cursor: pointer;\n  background: #0974f1;\n  border-radius: 5px;\n  box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2);\n}\n\n.card:hover {\n  box-shadow: 0 0 20px rgba(9, 117, 241, 0.8);\n  border-color: #0974f1;\n}\n\n.content .btn:hover {\n  outline: 2px solid #e8e8e8;\n  background: transparent;\n  color: #e8e8e8;\n}\n\n.content .btn:active {\n  box-shadow: none;\n}",
    "slots": [
      {
        "key": "title",
        "label": "Title",
        "kind": "text",
        "value": "Card Hover Effect"
      },
      {
        "key": "text",
        "label": "Text",
        "kind": "textarea",
        "value": "Lorem ipsum dolor sit amet, consectetur adipisicing elit. Modi laboriosam at voluptas minus culpa deserunt delectus sapiente inventore pariatur"
      },
      {
        "key": "button",
        "label": "Button label",
        "kind": "text",
        "value": "Read more"
      },
      {
        "key": "link",
        "label": "Link",
        "kind": "link",
        "value": "#"
      }
    ],
    "source": {
      "library": "Uiverse",
      "author": "gharsh11032000",
      "url": "https://github.com/uiverse-io/galaxy/blob/main/Cards/gharsh11032000_happy-hound-90.html",
      "licence": "MIT",
      "copyright": "Copyright (c) 2023 Uiverse.io",
      "changes": "Text made editable. The button is a link."
    }
  },
  {
    "id": "uiverse-double-ring",
    "name": "Double-ring spinner",
    "category": "Loaders",
    "tags": [
      "loader",
      "spinner",
      "animated"
    ],
    "size": {
      "w": 2,
      "h": 4
    },
    "html": "<div class=\"loader\">\n    <div></div>\n</div>",
    "css": "/* From Uiverse.io by Cornerstone-04 - Tags: loader */\n.loader {\n  width: 50px;\n  height: 50px;\n  border: 7px double;\n  border-color: {{color}} transparent;\n  border-radius: 50%;\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  animation: spin13213 2s linear infinite;\n}\n\n.loader div {\n  width: 50%;\n  height: 50%;\n  background-color: {{color}};\n  border-radius: 50%;\n}\n\n@keyframes spin13213 {\n  to {\n    transform: rotate(360deg);\n  }\n}",
    "slots": [
      {
        "key": "color",
        "label": "Colour",
        "kind": "color",
        "value": "#43cec7"
      }
    ],
    "source": {
      "library": "Uiverse",
      "author": "Cornerstone-04",
      "url": "https://github.com/uiverse-io/galaxy/blob/main/loaders/Cornerstone-04_neat-dragon-24.html",
      "licence": "MIT",
      "copyright": "Copyright (c) 2023 Uiverse.io",
      "changes": "Colour made editable."
    }
  },
  {
    "id": "uiverse-equalizer",
    "name": "Equalizer bars loader",
    "category": "Loaders",
    "tags": [
      "loader",
      "bars",
      "music",
      "animated"
    ],
    "size": {
      "w": 2,
      "h": 5
    },
    "html": "<div class=\"spinner\">\n  <span></span>\n  <span></span>\n  <span></span>\n  <span></span>\n</div>",
    "css": "/* From Uiverse.io by satyamchaudharydev - Tags: loader */\n.spinner {\n --gap: 5px;\n --clr: {{color}};\n --height: 23px;\n width: 100px;\n height: 100px;\n display: flex;\n align-items: center;\n justify-content: center;\n gap: var(--gap);\n}\n\n.spinner span {\n background: var(--clr);\n width: 6px;\n height: var(--height);\n animation: grow 1s ease-in-out infinite;\n}\n\n.spinner span:nth-child(2) {\n animation: grow 1s ease-in-out 0.15s infinite;\n}\n\n.spinner span:nth-child(3) {\n animation: grow 1s ease-in-out 0.3s infinite;\n}\n\n.spinner span:nth-child(4) {\n animation: grow 1s ease-in-out 0.475s infinite;\n}\n\n@keyframes grow {\n 0%,100% {\n  transform: scaleY(1);\n }\n\n 50% {\n  transform: scaleY(1.8);\n }\n}",
    "slots": [
      {
        "key": "color",
        "label": "Colour",
        "kind": "color",
        "value": "#d62d20"
      }
    ],
    "source": {
      "library": "Uiverse",
      "author": "satyamchaudharydev",
      "url": "https://github.com/uiverse-io/galaxy/blob/main/loaders/satyamchaudharydev_yellow-dragon-0.html",
      "licence": "MIT",
      "copyright": "Copyright (c) 2023 Uiverse.io",
      "changes": "Colour made editable."
    }
  },
  {
    "id": "uiverse-floating-input",
    "name": "Floating label input",
    "category": "Forms",
    "tags": [
      "input",
      "form",
      "label",
      "animated"
    ],
    "size": {
      "w": 3,
      "h": 4
    },
    "html": "<div class=\"inputGroup\">\n    <input type=\"text\" required=\"\" autocomplete=\"off\">\n    <label for=\"name\">{{label}}</label>\n</div>",
    "css": "/* From Uiverse.io by Maximinodotpy - Tags: input */\n.inputGroup {\n  font-family: 'Segoe UI', sans-serif;\n  margin: 1em 0 1em 0;\n  max-width: 190px;\n  position: relative;\n}\n\n.inputGroup input {\n  font-size: 100%;\n  padding: 0.8em;\n  outline: none;\n  border: 2px solid rgb(200, 200, 200);\n  background-color: transparent;\n  border-radius: 20px;\n  width: 100%;\n}\n\n.inputGroup label {\n  font-size: 100%;\n  position: absolute;\n  left: 0;\n  padding: 0.8em;\n  margin-left: 0.5em;\n  pointer-events: none;\n  transition: all 0.3s ease;\n  color: rgb(100, 100, 100);\n}\n\n.inputGroup :is(input:focus, input:valid)~label {\n  transform: translateY(-50%) scale(.9);\n  margin: 0em;\n  margin-left: 1.3em;\n  padding: 0.4em;\n  background-color: #e8e8e8;\n}\n\n.inputGroup :is(input:focus, input:valid) {\n  border-color: rgb(150, 150, 200);\n}",
    "slots": [
      {
        "key": "label",
        "label": "Label",
        "kind": "text",
        "value": "Name"
      }
    ],
    "source": {
      "library": "Uiverse",
      "author": "Maximinodotpy",
      "url": "https://github.com/uiverse-io/galaxy/blob/main/Inputs/Maximinodotpy_thin-sheep-13.html",
      "licence": "MIT",
      "copyright": "Copyright (c) 2023 Uiverse.io",
      "changes": "Text made editable."
    }
  },
  {
    "id": "uiverse-apple-toggle",
    "name": "iOS-style toggle switch",
    "category": "Forms",
    "tags": [
      "toggle",
      "switch",
      "checkbox"
    ],
    "size": {
      "w": 2,
      "h": 3
    },
    "html": "<div class=\"checkbox-apple\">\n  <input class=\"yep\" id=\"check-apple\" type=\"checkbox\">\n  <label for=\"check-apple\"></label>\n</div>",
    "css": "/* From Uiverse.io by guilhermeyohan - Tags: checkbox */\n.checkbox-apple {\n  position: relative;\n  width: 50px;\n  height: 25px;\n  margin: 20px;\n  -webkit-user-select: none;\n  -moz-user-select: none;\n  -ms-user-select: none;\n  user-select: none;\n}\n\n.checkbox-apple label {\n  position: absolute;\n  top: 0;\n  left: 0;\n  width: 50px;\n  height: 25px;\n  border-radius: 50px;\n  background: linear-gradient(to bottom, #b3b3b3, #e6e6e6);\n  cursor: pointer;\n  transition: all 0.3s ease;\n}\n\n.checkbox-apple label:after {\n  content: '';\n  position: absolute;\n  top: 1px;\n  left: 1px;\n  width: 23px;\n  height: 23px;\n  border-radius: 50%;\n  background-color: #fff;\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);\n  transition: all 0.3s ease;\n}\n\n.checkbox-apple input[type=\"checkbox\"]:checked + label {\n  background: linear-gradient(to bottom, #4cd964, #5de24e);\n}\n\n.checkbox-apple input[type=\"checkbox\"]:checked + label:after {\n  transform: translateX(25px);\n}\n\n.checkbox-apple label:hover {\n  background: linear-gradient(to bottom, #b3b3b3, #e6e6e6);\n}\n\n.checkbox-apple label:hover:after {\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);\n}\n\n.yep {\n  position: absolute;\n  top: 0;\n  left: 0;\n  width: 50px;\n  height: 25px;\n}",
    "slots": [],
    "source": {
      "library": "Uiverse",
      "author": "guilhermeyohan",
      "url": "https://github.com/uiverse-io/galaxy/blob/main/Toggle-switches/guilhermeyohan_great-snake-42.html",
      "licence": "MIT",
      "copyright": "Copyright (c) 2023 Uiverse.io"
    }
  },
  {
    "id": "uiverse-info-tooltip",
    "name": "Info icon tooltip",
    "category": "Badges",
    "tags": [
      "tooltip",
      "icon",
      "hover",
      "info"
    ],
    "size": {
      "w": 2,
      "h": 3
    },
    "html": "<div class=\"tooltip\">\n  <div class=\"icon\">{{icon}}</div>\n  <div class=\"tooltiptext\">{{tip}}</div>\n</div>",
    "css": "/* From Uiverse.io by SmookyDev  - Tags: simple, neumorphism, skeuomorphism, flashy, tooltip, icon, hover effect, css */\n.tooltip {\n  position: relative;\n  display: inline-block;\n  cursor: pointer;\n  font-family: \"Arial\", sans-serif;\n}\n\n.tooltip:hover .tooltiptext {\n  visibility: visible;\n  opacity: 1;\n}\n\n.tooltiptext {\n  visibility: hidden;\n  width: 200px;\n  background-color: #333;\n  color: #fff;\n  text-align: center;\n  border-radius: 5px;\n  padding: 10px;\n  position: absolute;\n  z-index: 1;\n  top: 125%;\n  left: 50%;\n  margin-left: -100px;\n  opacity: 0;\n  transition: opacity 0.3s;\n}\n\n.tooltiptext::after {\n  content: \"\";\n  position: absolute;\n  top: -10px;\n  left: 50%;\n  margin-left: -10px;\n  border-width: 10px;\n  border-style: solid;\n  border-color: transparent transparent #333 transparent;\n}\n\n.tooltip .icon {\n  display: inline-block;\n  width: 20px;\n  height: 20px;\n  background-color: #4caf50;\n  color: #fff;\n  border-radius: 50%;\n  text-align: center;\n  line-height: 20px;\n}",
    "slots": [
      {
        "key": "icon",
        "label": "Icon",
        "kind": "text",
        "value": "i"
      },
      {
        "key": "tip",
        "label": "Tooltip",
        "kind": "text",
        "value": "This is a cool tooltip!"
      }
    ],
    "source": {
      "library": "Uiverse",
      "author": "SmookyDev",
      "url": "https://github.com/uiverse-io/galaxy/blob/main/Tooltips/SmookyDev_plastic-dragonfly-83.html",
      "licence": "MIT",
      "copyright": "Copyright (c) 2023 Uiverse.io",
      "changes": "Text made editable."
    }
  },
  {
    "id": "uiverse-rainbow-notification",
    "name": "Rainbow-border notification",
    "category": "Badges",
    "tags": [
      "notification",
      "gradient",
      "toast"
    ],
    "size": {
      "w": 3,
      "h": 4
    },
    "html": "<div class=\"notification gradient-border\">\n  <div class=\"icon\">{{icon}}</div>\n  <div class=\"message-container\">\n    <div class=\"title\">{{title}}</div>\n    <div class=\"message\">{{message}}</div>\n  </div>\n\n</div>",
    "css": "/* From Uiverse.io by Gianluks90 - Tags: notification */\n.notification {\n  width: 255px;\n  height: 60px;\n  background: white;\n  border-radius: 25px;\n  display: flex;\n  justify-content: space-evenly;\n  align-items: center;\n}\n\n.icon {\n  height: 40px;\n  width: 40px;\n  border-radius: 20px;\n  background-color: rgb(236, 236, 236);\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  padding-top: 2px;\n}\n\n.message-container {\n  display: flex;\n  flex-direction: column;\n}\n\n.title {\n  padding: 2px;\n  text-transform: uppercase;\n  color: black;\n  font-weight: 600;\n}\n\n.message {\n  padding: 2px;\n  color: black;\n  font-size: small;\n}\n\n.gradient-border {\n  --borderSize: 3px;\n  position: relative;\n  border-radius: var(--borderSize);\n}\n\n.gradient-border:after {\n  content: '';\n  position: absolute;\n  top: calc(-1 * var(--borderSize));\n  left: calc(-1 * var(--borderSize));\n  height: calc(100% + var(--borderSize) * 2);\n  width: calc(100% + var(--borderSize) * 2);\n  background: linear-gradient(75deg, #E50000, #FF8D00, #FFEE00, #008121, #004CFF, #760188);\n  border-radius: calc(2 * var(--borderSize));\n  z-index: -1;\n  animation: gradientAnimation 4s ease alternate infinite;\n  background-size: 300% 300%;\n}\n\n@keyframes gradientAnimation {\n  0% {\n    background-position: 0% 50%;\n  }\n\n  50% {\n    background-position: 100% 50%;\n  }\n\n  100% {\n    background-position: 0% 50%;\n  }\n}",
    "slots": [
      {
        "key": "icon",
        "label": "Icon",
        "kind": "text",
        "value": "❤️"
      },
      {
        "key": "title",
        "label": "Title",
        "kind": "text",
        "value": "Congratulations!"
      },
      {
        "key": "message",
        "label": "Message",
        "kind": "text",
        "value": "You've reached a new level!"
      }
    ],
    "source": {
      "library": "Uiverse",
      "author": "Gianluks90",
      "url": "https://github.com/uiverse-io/galaxy/blob/main/Notifications/Gianluks90_funny-impala-78.html",
      "licence": "MIT",
      "copyright": "Copyright (c) 2023 Uiverse.io",
      "changes": "Text made editable."
    }
  },
  {
    "id": "uiverse-level-up",
    "name": "Level-up badge",
    "category": "Badges",
    "tags": [
      "badge",
      "notification",
      "bold"
    ],
    "size": {
      "w": 3,
      "h": 4
    },
    "html": "<div class=\"level-up\">\n  <span class=\"text\">{{text}}</span>\n</div>",
    "css": "/* From Uiverse.io by tursynbek - Tags: notification */\n.level-up {\n  font-family: 'Montserrat', sans-serif;\n  font-size: 25px;\n  font-weight: bold;\n  color: #ffffff;\n  background-color: #ff5733;\n  padding: 20px;\n  border-radius: 10px;\n  box-shadow: 0px 5px 10px rgba(0,0,0,0.2);\n  text-align: center;\n  transition: all 0.3s ease;\n}\n\n.text {\n  position: relative;\n  display: inline-block;\n  animation: bounce 1s infinite;\n}\n\n.level-up:hover {\n  background-color: #ffffff;\n  color: #ff5733;\n  transform: scale(1.1);\n}\n\n.level-up:hover .text {\n  animation: none;\n}\n\n@keyframes bounce {\n  0% {\n    transform: translateY(0);\n  }\n\n  50% {\n    transform: translateY(-10px);\n  }\n\n  100% {\n    transform: translateY(0);\n  }\n}\n\n.level-up:hover::before {\n  content: \"\";\n  display: block;\n  width: 10px;\n  height: 10px;\n  background-color: #ff5733;\n  border-radius: 50%;\n  position: absolute;\n  top: -20px;\n  left: calc(50% - 5px);\n  animation: bounce 0.5s infinite;\n}",
    "slots": [
      {
        "key": "text",
        "label": "Text",
        "kind": "text",
        "value": "LEVEL UP!"
      }
    ],
    "source": {
      "library": "Uiverse",
      "author": "tursynbek",
      "url": "https://github.com/uiverse-io/galaxy/blob/main/Notifications/tursynbek_gentle-kangaroo-69.html",
      "licence": "MIT",
      "copyright": "Copyright (c) 2023 Uiverse.io",
      "changes": "Text made editable."
    }
  }
];
