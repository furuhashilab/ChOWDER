/*jslint devel:true*/
/*global require, socket, module, Buffer */

(function () {
	"use strict";
	
	var Command = {
		RegisterEvent : "RegisterEvent",
		
		// request command
		AddContent : "AddContent",
		AddMetaData : "AddMetaData",
		GetContent : "GetContent",
		GetMetaData : "GetMetaData",
		DeleteContent : "DeleteContent",
		AddWindow : "AddWindow",
		DeleteWindow : "DeleteWindow",
		GetWindow : "GetWindow",
		UpdateVirtualDisplay : "UpdateVirtualDisplay",
		GetVirtualDisplay : "GetVirtualDisplay",
		
		// using both server and client
		Update : "Update",
		UpdateMetaData : "UpdateMetaData",
		UpdateContent : "UpdateContent",
		UpdateWindow : "UpdateWindow",
		ShowWindowID : "ShowWindowID"
	};
	
	module.exports = Command;
}());
