var SearchCriteria = function (id, textClause, criteria, searchClause) {
	this.id = id;
	this.textClause = textClause;
	this.criteria = criteria;
	this.searchClause = searchClause;
};

// Concatenates the MdSearchCriteria Object properties into a 
// usable string that is passed to a search query for SME
SearchCriteria.prototype.getCriteriaString = function () {

	var metadataString = this.id.toString() + ',';

	// Add our textClause
	if (typeof this.textClause === 'number')
		metadataString += (this.textClause === 0 ? 'x' : 'c') + ',';
	else
		metadataString += this.textClause + ',';

	metadataString += this.criteria + ',';

	// Add our searchClause
	if (typeof this.searchClause === 'number')
		metadataString += (this.searchClause === 1 ? 'and' : 'or');
	else
		metadataString += this.searchClause;

	return metadataString;
};

module.exports = SearchCriteria;