var SearchResult = function (fileId, folderId, userId, description, extension, filename, createdOn, modifiedOn, matchedOn, tags) {
	this.fileId = fileId;
	this.folderId = folderId;
	this.userId = userId;
	this.description = description;
	this.extension = extension;
	this.filename = filename;
	this.createdOn = createdOn;
	this.modifiedOn = modifiedOn;
	this.matchedOn = matchedOn;
	this.tags = tags
};

SearchResult.prototype.assignMetadata = function (metadata) {
	this.metadata = metadata;
};