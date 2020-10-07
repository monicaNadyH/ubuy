// The ConversationPanel module is designed to handle
// all display and behaviors of the conversation column of the app.
/* eslint no-unused-vars: "off" */
/* global Api: true, Common: true*/

var ConversationPanel = (function () {
  var settings = {
    selectors: {
      chatBox: '#scrollingChat',
      fromUser: '.from-user',
      fromWatson: '.from-watson',
      latest: '.latest'
    },
    authorTypes: {
      user: 'user',
      watson: 'watson'
    }
  };

  // Publicly accessible methods defined
  return {
    init: init,
    inputKeyDown: inputKeyDown,
    sendMessage: sendMessage
  };

  // Initialize the module
  function init() {
    chatUpdateSetup();
    Api.getSessionId(function() {
      Api.sendRequest('', null);
    });
    setupInputBox();
  }
  // Set up callbacks on payload setters in Api module
  // This causes the displayMessage function to be called when messages are sent / received
  function chatUpdateSetup() {
    var currentRequestPayloadSetter = Api.setRequestPayload;
    Api.setRequestPayload = function (newPayloadStr) {
      currentRequestPayloadSetter.call(Api, newPayloadStr);
      displayMessage(JSON.parse(newPayloadStr), settings.authorTypes.user);
    };

    var currentResponsePayloadSetter = Api.setResponsePayload;
    Api.setResponsePayload = function (newPayloadStr) {
      currentResponsePayloadSetter.call(Api, newPayloadStr);
      displayMessage(JSON.parse(newPayloadStr).result, settings.authorTypes.watson);
    };

    Api.setErrorPayload = function (newPayload) {
      displayMessage(newPayload, settings.authorTypes.watson);
    };
  }

  // Set up the input box to underline text as it is typed
  // This is done by creating a hidden dummy version of the input box that
  // is used to determine what the width of the input text should be.
  // This value is then used to set the new width of the visible input box.
  function setupInputBox() {
    var input = document.getElementById('textInput');
    var dummy = document.getElementById('textInputDummy');
    var minFontSize = 14;
    var maxFontSize = 16;
    var minPadding = 4;
    var maxPadding = 6;

    // If no dummy input box exists, create one
    if (dummy === null) {
      var dummyJson = {
        'tagName': 'div',
        'attributes': [{
          'name': 'id',
          'value': 'textInputDummy'
        }]
      };

      dummy = Common.buildDomElement(dummyJson);
      document.body.appendChild(dummy);
    }

    function adjustInput() {
      if (input.value === '') {
        // If the input box is empty, remove the underline
        input.classList.remove('underline');
        input.setAttribute('style', 'width:' + '100%');
        input.style.width = '100%';
      } else {
        // otherwise, adjust the dummy text to match, and then set the width of
        // the visible input box to match it (thus extending the underline)
        input.classList.add('underline');
        var txtNode = document.createTextNode(input.value);
        ['font-size', 'font-style', 'font-weight', 'font-family', 'line-height',
          'text-transform', 'letter-spacing'
        ].forEach(function (index) {
          dummy.style[index] = window.getComputedStyle(input, null).getPropertyValue(index);
        });
        dummy.textContent = txtNode.textContent;

        var padding = 0;
        var htmlElem = document.getElementsByTagName('html')[0];
        var currentFontSize = parseInt(window.getComputedStyle(htmlElem, null).getPropertyValue('font-size'), 10);
        if (currentFontSize) {
          padding = Math.floor((currentFontSize - minFontSize) / (maxFontSize - minFontSize) *
            (maxPadding - minPadding) + minPadding);
        } else {
          padding = maxPadding;
        }

        var widthValue = (dummy.offsetWidth + padding) + 'px';
        input.setAttribute('style', 'width:' + widthValue);
        input.style.width = widthValue;
      }
    }

    // Any time the input changes, or the window resizes, adjust the size of the input box
    input.addEventListener('input', adjustInput);
    window.addEventListener('resize', adjustInput);

    // Trigger the input event once to set up the input box and dummy element
    Common.fireEvent(input, 'input');
  }

  // Display a user or Watson message that has just been sent/received
  function displayMessage(newPayload, typeValue) {
    var isUser = isUserMessage(typeValue);
    //var textExists = newPayload.generic;
    if ((newPayload.output && newPayload.output.generic) ||  newPayload.input){
      // Create new message generic elements
      var responses = buildMessageDomElements(newPayload, isUser);
      var chatBoxElement = document.querySelector(settings.selectors.chatBox);
      var previousLatest = chatBoxElement.querySelectorAll((isUser ? settings.selectors.fromUser : settings.selectors.fromWatson) +
        settings.selectors.latest);
      // Previous "latest" message is no longer the most recent
      if (previousLatest) {
        Common.listForEach(previousLatest, function (element) {
          element.classList.remove('latest');
        });
      }
      setResponse(responses, isUser, chatBoxElement, 0, true);
    }
  }

  // Recurisive function to add responses to the chat area
  function setResponse(responses, isUser, chatBoxElement, index, isTop) {
    if (index < responses.length) {
      var res = responses[index];
      if (res.type !== 'pause') {
        var currentDiv = getDivObject(res, isUser, isTop);
        chatBoxElement.appendChild(currentDiv);
        // Class to start fade in animation
        currentDiv.classList.add('load');
        // Move chat to the most recent messages when new messages are added
        setTimeout(function () {
          // wait a sec before scrolling
          scrollToChatBottom();
        }, 1000);
        setResponse(responses, isUser, chatBoxElement, index + 1, false);
      } else {
        var userTypringField = document.getElementById('user-typing-field');
        if (res.typing) {
          userTypringField.innerHTML = 'Watson Assistant Typing...';
        }
        setTimeout(function () {
          userTypringField.innerHTML = '';
          setResponse(responses, isUser, chatBoxElement, index + 1, isTop);
        }, res.time);
      }
    }
  }

  // Constructs new DOM element from a message
  function getDivObject(res, isUser, isTop) {
    var classes = [(isUser ? 'from-user' : 'from-watson'), 'latest', (isTop ? 'top' : 'sub')];
    var messageJson = {
      // <div class='segments'>
      'tagName': 'div',
      'classNames': ['segments'],
      'children': [{
        // <div class='from-user/from-watson latest'>
        'tagName': 'div',
        'classNames': classes,
        'children': [{
          // <div class='message-inner'>
          'tagName': 'div',
          'classNames': ['message-inner'],
          'children': [{
            // <p>{messageText}</p>
            'tagName': 'p',
            'text': res.innerhtml
          }]
        }]
      }]
    };
    return Common.buildDomElement(messageJson);
  }

  // Checks if the given typeValue matches with the user "name", the Watson "name", or neither
  // Returns true if user, false if Watson, and null if neither
  // Used to keep track of whether a message was from the user or Watson
  function isUserMessage(typeValue) {
    if (typeValue === settings.authorTypes.user) {
      return true;
    } else if (typeValue === settings.authorTypes.watson) {
      return false;
    }
    return null;
  }

  function getOptions(optionsList, preference) {
    var list = '';
    var i = 0;
    if (optionsList !== null) {
      if (preference === 'text') {
        list = '<ul>';
        for (i = 0; i < optionsList.length; i++) {
          if (optionsList[i].value) {
            list += '<li><div class="options-list" onclick="ConversationPanel.sendMessage(\'' +
            optionsList[i].value.input.text + '\');" >' + optionsList[i].label + '</div></li>';
          }
        }
        list += '</ul>';
      } else if (preference === 'button') {
        list = '<br>';
        for (i = 0; i < optionsList.length; i++) {
          if (optionsList[i].value) {
            var item = '<div class="options-button" onclick="ConversationPanel.sendMessage(\'' +
              optionsList[i].value.input.text + '\');" >' + optionsList[i].label + '</div>';
            list += item;
          }
        }
      }
    }
    return list;
  }

  function getResponse(responses, gen, entities, intents) {
    var title = '', description = '';
    if (gen.hasOwnProperty('title')) {
      title = gen.title;
    }
    if (gen.hasOwnProperty('description')) {
      description = '<div>' + gen.description + '</div>';
    }
    if (gen.response_type === 'image') {
      var img = '<div><img src="' + gen.source + '" width="300"></div>';
      responses.push({
        type: gen.response_type,
        innerhtml: title + description + img
      });
    } else if (gen.response_type === 'text') {
      responses.push({
        type: gen.response_type,
        innerhtml: gen.text
      });
  } else if (gen.response_type === 'search') {
      console.log(gen.results);
      if (entities.length>1 && gen.results.length>0 && (entities[0]["entity"]==="definition" || entities[1]["entity"]==="definition")  && intents[0]["intent"]==="ask_for_definitions"){

        var percentage= (gen.results[0]["result_metadata"]['confidence']*100).toFixed(1);
        // if (percentage===0){
        //   break;
        // }
        new_percentage=percentage.toString();

        output=" From the documents I have, I've found the below definition:"
        output= output + "</br> " + gen.results[0]["body"] + "<br />" + "Document name: "+ gen.results[0]['url'] + "<br />" + "confidence: " + new_percentage + "%" + "<br />"

      }
      else{


        //new_percentage=percentage.toString();
        output=" From the documents I have, I've found the below passages that might answer your question: "
        for(let i=0; i< gen.results.length; i++){
          pass_num= (i+1).toString()

        //console.log(i)
        var percentage= (gen.results[i]["result_metadata"]['confidence']*100).toFixed(1);

        // if (percentage === 0){
        //   break;
        // }
        new_percentage=percentage.toString();

        // if (gen.results[i]["highlight"]["text"]) {
        //     output= output + "</br> " + pass_num+ ") " + gen.results[i]["highlight"]["text"] + "<br />" + "Document name: "+ gen.results[i]['url'] + "<br />" + "confidence: " + new_percentage + "%"
        //   }
        // else{
        //     output= output + "</br> " + pass_num+ ") " + gen.results[i]["body"] + "<br />" + "Document name: "+ gen.results[i]['url'] + "<br />" + "confidence: " + new_percentage + "%"
        //
        //   }

        if (gen.results[i]["highlight"]["text"]) {
            output= output +  gen.results[i]["highlight"]["text"] 
          }
        else{
            output= output + gen.results[i]["body"]
          }

        if (i === 0) { break; }
      }
      // else{
      //   output= "Sorry I could not find the answer in the manuals"
      // }
    }

      responses.push({
        type: gen.response_type,
        innerhtml: output

      });
    } else if (gen.response_type === 'pause') {
      responses.push({
        type: gen.response_type,
        time: gen.time,
        typing: gen.typing
      });
    } else if (gen.response_type === 'option') {
      var preference = 'text';
      if (gen.hasOwnProperty('preference')) {
        preference = gen.preference;
      }

      var list = getOptions(gen.options, preference);
      responses.push({
        type: gen.response_type,
        innerhtml: title + description + list
      });
    }
  }

  // Constructs new generic elements from a message payload
  function buildMessageDomElements(newPayload, isUser) {
    var textArray = isUser ? newPayload.input.text : newPayload.output.text;
    if (Object.prototype.toString.call(textArray) !== '[object Array]') {
      textArray = [textArray];
    }

    var responses = [];

    var def= false;

    if (newPayload.hasOwnProperty('output')) {
      if (newPayload.output.hasOwnProperty('generic')) {

        var generic = newPayload.output.generic;

        var entities = newPayload.output.entities;

        var intents = newPayload.output.intents;

        generic.forEach(function (gen) {
          getResponse(responses, gen, entities, intents);
        });
      }

    } else if (newPayload.hasOwnProperty('input')) {
      var input = '';
      textArray.forEach(function (msg) {
        input += msg + ' ';
      });
      input = input.trim()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      if (input.length !== 0) {
        responses.push({
          type: 'text',
          innerhtml: input
        });
      }
    }
    return responses;
  }

  // Scroll to the bottom of the chat window
  function scrollToChatBottom() {
    var scrollingChat = document.querySelector('#scrollingChat');
    scrollingChat.scrollTop = scrollingChat.scrollHeight;
  }

  function sendMessage(text) {
    // Send the user message
    Api.sendRequest(text);
  }

  // Handles the submission of input
  function inputKeyDown(event, inputBox) {
    // Submit on enter key, dis-allowing blank messages
    if (event.keyCode === 13 && inputBox.value) {
      sendMessage(inputBox.value);
      // Clear input box for further messages
      inputBox.value = '';
      Common.fireEvent(inputBox, 'input');
    }
  }
}());
