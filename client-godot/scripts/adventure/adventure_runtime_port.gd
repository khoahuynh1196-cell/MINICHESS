class_name AdventureRuntimePort
extends RefCounted

signal request_submitted(request: Dictionary)
signal view_changed(view: Dictionary)
signal protocol_error(message: String)

const PRIVATE_VIEW_FIELDS := [
	"seed", "shopPool", "commandHistory", "refreshNumber", "acquisitionCounter",
]

var _view: Dictionary = {}

func has_view() -> bool:
	return not _view.is_empty()

func current_view() -> Dictionary:
	return _view.duplicate(true)

func submit(request: Dictionary) -> bool:
	if not _valid_request_envelope(request):
		return false
	request_submitted.emit(request.duplicate(true))
	return true

func accept_response(response: Dictionary) -> bool:
	var revision_value = response.get("revision", null)
	var replayed_value = response.get("replayed", null)
	var view_value = response.get("view", null)
	if typeof(revision_value) != TYPE_INT or int(revision_value) < 0:
		return _fail("Adventure runtime response revision is invalid")
	if typeof(replayed_value) != TYPE_BOOL:
		return _fail("Adventure runtime response replayed flag is invalid")
	if typeof(view_value) != TYPE_DICTIONARY:
		return _fail("Adventure runtime response view is invalid")
	var view: Dictionary = view_value
	if int(view.get("revision", -1)) != int(revision_value):
		return _fail("Adventure runtime response revision does not match its view")
	if has_view() and int(revision_value) < int(_view.get("revision", -1)):
		return _fail("Adventure runtime response is stale")
	for field in PRIVATE_VIEW_FIELDS:
		if _contains_key_recursive(view, field):
			return _fail("Adventure runtime response leaked private field: %s" % field)
	_view = view.duplicate(true)
	view_changed.emit(_view.duplicate(true))
	return true

func clear() -> void:
	_view.clear()

func _valid_request_envelope(request: Dictionary) -> bool:
	if String(request.get("commandId", "")).strip_edges().is_empty():
		return _fail("Adventure runtime commandId is missing")
	var revision_value = request.get("expectedRevision", null)
	if typeof(revision_value) != TYPE_INT or int(revision_value) < 0:
		return _fail("Adventure runtime expectedRevision is invalid")
	if String(request.get("type", "")).strip_edges().is_empty():
		return _fail("Adventure runtime command type is missing")
	return true

func _contains_key_recursive(value, target_key: String) -> bool:
	if value is Dictionary:
		var record: Dictionary = value
		if record.has(target_key):
			return true
		for child in record.values():
			if _contains_key_recursive(child, target_key):
				return true
	elif value is Array:
		for child in value:
			if _contains_key_recursive(child, target_key):
				return true
	return false

func _fail(message: String) -> bool:
	protocol_error.emit(message)
	return false
