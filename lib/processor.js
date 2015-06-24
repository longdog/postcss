import LazyResult from './lazy-result';

export default class Processor {

    constructor(plugins = []) {
        this.plugins = this.normalize(plugins);
    }

    use(plugin) {
        this.plugins = this.plugins.concat(this.normalize([plugin]));
        return this;
    }

    process(css, opts = { }) {
        return new LazyResult(this, css, opts);
    }

    normalize(plugins) {
        let normalized = [];
        for ( let i of plugins ) {
            let type = typeof i;
            if ( (type === 'object' || type === 'function') && i.postcss ) {
                normalized.push(i.postcss);
            } else if ( type === 'object' && Array.isArray(i.plugins) ) {
                normalized = normalized.concat(i.plugins);
            } else {
                normalized.push(i);
            }
        }
        return normalized;
    }

}

Processor.prototype.version = require('../package').version;
