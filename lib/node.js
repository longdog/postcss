import CssSyntaxError from './css-syntax-error';
import stringifier    from './stringifier';

const defaultStyle = {
    colon:         ': ',
    indent:        '    ',
    beforeDecl:    '\n',
    beforeRule:    '\n',
    beforeOpen:    ' ',
    beforeClose:   '\n',
    beforeComment: '\n',
    after:         '\n',
    emptyBody:     '',
    commentLeft:   ' ',
    commentRight:  ' '
};

let cloneNode = function (obj, parent) {
    let cloned = new obj.constructor();

    for ( let i in obj ) {
        if ( !obj.hasOwnProperty(i) ) continue;
        let value = obj[i];
        let type  = typeof value;

        if ( i === 'parent' && type === 'object' ) {
            if (parent) cloned[i] = parent;
        } else if ( i === 'source' ) {
            cloned[i] = value;
        } else if ( value instanceof Array ) {
            cloned[i] = value.map( j => cloneNode(j, cloned) );
        } else if ( i !== 'before'  && i !== 'after' &&
                    i !== 'between' && i !== 'semicolon' ) {
            if ( type === 'object' ) value = cloneNode(value);
            cloned[i] = value;
        }
    }

    return cloned;
};

export default class Node {

    constructor(defaults = { }) {
        for ( let name in defaults ) {
            this[name] = defaults[name];
        }
    }

    error(message, opts = { }) {
        if ( this.source ) {
            let pos = this.source.start;
            return this.source.input.error(message, pos.line, pos.column, opts);
        } else {
            return new CssSyntaxError(message);
        }
    }

    removeSelf() {
        if ( this.parent ) {
            this.parent.remove(this);
        }
        this.parent = undefined;
        return this;
    }

    replace(nodes) {
        this.parent.insertBefore(this, nodes);
        this.parent.remove(this);
        return this;
    }

    toString() {
        let result  = '';
        let builder = (str) => result += str;
        stringifier.stringify(builder, this);
        return result;
    }

    clone(overrides = { }) {
        let cloned = cloneNode(this);
        for ( let name in overrides ) {
            cloned[name] = overrides[name];
        }
        return cloned;
    }

    cloneBefore(overrides = { }) {
        let cloned = this.clone(overrides);
        this.parent.insertBefore(this, cloned);
        return cloned;
    }

    cloneAfter(overrides = { }) {
        let cloned = this.clone(overrides);
        this.parent.insertAfter(this, cloned);
        return cloned;
    }

    replaceWith(node) {
        this.parent.insertBefore(this, node);
        this.removeSelf();
        return this;
    }

    moveTo(container) {
        this.cleanStyles(this.root() === container.root());
        this.removeSelf();
        container.append(this);
        return this;
    }

    moveBefore(node) {
        this.cleanStyles(this.root() === node.root());
        this.removeSelf();
        node.parent.insertBefore(node, this);
        return this;
    }

    moveAfter(node) {
        this.cleanStyles(this.root() === node.root());
        this.removeSelf();
        node.parent.insertAfter(node, this);
        return this;
    }

    next() {
        let index = this.parent.index(this);
        return this.parent.nodes[index + 1];
    }

    prev() {
        let index = this.parent.index(this);
        return this.parent.nodes[index - 1];
    }

    toJSON() {
        let fixed = { };

        for ( let name in this ) {
            if ( !this.hasOwnProperty(name) ) continue;
            if ( name === 'parent' ) continue;
            let value = this[name];

            if ( value instanceof Array ) {
                fixed[name] = value.map( (i) => {
                    if ( typeof i === 'object' && i.toJSON ) {
                        return i.toJSON();
                    } else {
                        return i;
                    }
                });
            } else if ( typeof value === 'object' && value.toJSON ) {
                fixed[name] = value.toJSON();
            } else {
                fixed[name] = value;
            }
        }

        return fixed;
    }

    style(own, detect) {
        let value;
        if ( !detect ) detect = own;

        // Already had
        if ( own ) {
            value = this[own];
            if ( typeof value !== 'undefined' ) return value;
        }

        let parent = this.parent;

        // Hack for first rule in CSS
        if ( detect === 'before' ) {
            if ( !parent || parent.type === 'root' && parent.first === this ) {
                return '';
            }
        }

        // Floating child without parent
        if ( !parent ) return defaultStyle[detect];

        // Detect style by other nodes
        let root = this.root();
        if ( !root.styleCache ) root.styleCache = { };
        if ( typeof root.styleCache[detect] !== 'undefined' ) {
            return root.styleCache[detect];
        }

        if ( detect === 'semicolon' ) {
            root.eachInside( (i) => {
                if ( i.nodes && i.nodes.length && i.last.type === 'decl' ) {
                    value = i.semicolon;
                    if ( typeof value !== 'undefined' ) return false;
                }
            });
        } else if ( detect === 'emptyBody' ) {
            root.eachInside( (i) => {
                if ( i.nodes && i.nodes.length === 0 ) {
                    value = i.after;
                    if ( typeof value !== 'undefined' ) return false;
                }
            });
        } else if ( detect === 'indent' ) {
            root.eachInside( (i) => {
                let p = i.parent;
                if ( p && p !== root && p.parent && p.parent === root ) {
                    if ( typeof i.before !== 'undefined' ) {
                        let parts = i.before.split('\n');
                        value = parts[parts.length - 1];
                        value = value.replace(/[^\s]/g, '');
                        return false;
                    }
                }
            });
        } else if ( detect === 'beforeComment' ) {
            root.eachComment( (i) => {
                if ( typeof i.before !== 'undefined' ) {
                    value = i.before;
                    if ( value.indexOf('\n') !== -1 ) {
                        value = value.replace(/[^\n]+$/, '');
                    }
                    return false;
                }
            });
            if ( typeof value === 'undefined' ) {
                value = this.style(null, 'beforeDecl');
            }
        } else if ( detect === 'beforeDecl' ) {
            root.eachDecl( (i) => {
                if ( typeof i.before !== 'undefined' ) {
                    value = i.before;
                    if ( value.indexOf('\n') !== -1 ) {
                        value = value.replace(/[^\n]+$/, '');
                    }
                    return false;
                }
            });
            if ( typeof value === 'undefined' ) {
                value = this.style(null, 'beforeRule');
            }
        } else if ( detect === 'beforeRule' ) {
            root.eachInside( (i) => {
                if ( i.nodes && (i.parent !== root || root.first !== i) ) {
                    if ( typeof i.before !== 'undefined' ) {
                        value = i.before;
                        if ( value.indexOf('\n') !== -1 ) {
                            value = value.replace(/[^\n]+$/, '');
                        }
                        return false;
                    }
                }
            });
        } else if ( detect === 'beforeClose' ) {
            root.eachInside( (i) => {
                if ( i.nodes && i.nodes.length > 0 ) {
                    if ( typeof i.after !== 'undefined' ) {
                        value = i.after;
                        if ( value.indexOf('\n') !== -1 ) {
                            value = value.replace(/[^\n]+$/, '');
                        }
                        return false;
                    }
                }
            });
        } else if ( detect === 'before' || detect === 'after' ) {
            if ( this.type === 'decl' ) {
                value = this.style(null, 'beforeDecl');
            } else if ( this.type === 'comment' ) {
                value = this.style(null, 'beforeComment');
            } else if ( detect === 'before' ) {
                value = this.style(null, 'beforeRule');
            } else {
                value = this.style(null, 'beforeClose');
            }

            let node  = this.parent;
            let depth = 0;
            while ( node && node.type !== 'root' ) {
                depth += 1;
                node = node.parent;
            }

            if ( value.indexOf('\n') !== -1 ) {
                let indent = this.style(null, 'indent');
                if ( indent.length ) {
                    for ( let step = 0; step < depth; step++ ) value += indent;
                }
            }

            return value;
        } else if ( detect === 'colon' ) {
            root.eachDecl( (i) => {
                if ( typeof i.between !== 'undefined' ) {
                    value = i.between.replace(/[^\s:]/g, '');
                    return false;
                }
            });
        } else if ( detect === 'beforeOpen' ) {
            root.eachInside( (i) => {
                if ( i.type !== 'decl' ) {
                    value = i.between;
                    if ( typeof value !== 'undefined' ) return false;
                }
            });
        } else {
            root.eachInside( (i) => {
                value = i[own];
                if ( typeof value !== 'undefined' ) return false;
            });
        }

        if ( typeof value === 'undefined' ) value = defaultStyle[detect];

        root.styleCache[detect] = value;
        return value;
    }

    root() {
        let result = this;
        while ( result.parent ) result = result.parent;
        return result;
    }

    cleanStyles(keepBetween) {
        delete this.before;
        delete this.after;
        if ( !keepBetween ) delete this.between;

        if ( this.nodes ) {
            for ( let node of this.nodes ) node.cleanStyles(keepBetween);
        }
    }

}
