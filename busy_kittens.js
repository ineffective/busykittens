function jda_busy_kittens_initialise() {
	window.jda_busy_kittens = {
		prices: {
			checkPrices: function(prices) {
				for (var x in prices) {
					if (gamePage.resPool.get(prices[x].name).value < prices[x].val) {
						return false;
					}
				}
				return true;
			}
		},
		workshop: {
			auto: false,
			buy: function(name) {
				gamePage.tabs[3].render();
				for (var x in gamePage.tabs[3].buttons) {
					if (gamePage.tabs[3].buttons[x].name == name) {
						gamePage.tabs[3].buttons[x].onClick();
						gamePage.msg("AutoWorkshop: " + name, "notice", "autoworkshop");
					}
				}
			},
			findCandidate: function() {
				if (this.auto !== true) {
					return;
				}
				// simply run through the whole list and find something that's not bought:
				for (var x in gamePage.workshop.upgrades) {
					var upg = gamePage.workshop.get(gamePage.workshop.upgrades[x].name);
					if (upg.unlocked && !upg.researched) {
						// check prices
						if (jda_busy_kittens.prices.checkPrices(upg.prices)) {
							this.buy(upg.title);
							return;
						}
					}
				}
			}
		},
		science: {
			auto: false,
			buy: function(name) {
				gamePage.tabs[2].render();
				for (var x in gamePage.tabs[2].buttons) {
					if (gamePage.tabs[2].buttons[x].name == name) {
						if (gamePage.tabs[2].buttons[x].enabled) {
							gamePage.tabs[2].buttons[x].onClick();
							gamePage.msg("AutoScience: " + name, "notice", "autoscience");
						}
						return;
					}
				}
			},
			findCandidate: function() {
				if (this.auto !== true) {
					return;
				}
				for (var x in gamePage.science.techs) {
					var tech = gamePage.science.techs[x];
					if (tech.unlocked && !tech.researched) {
						if (jda_busy_kittens.prices.checkPrices(tech.prices)) {
							this.buy(tech.title);
							return;
						}
					}
				}
			}
		},
		hunt: {
			auto: false,
			toggle: function() {
				if (this.huntInterval === null) {
					this.huntInterval = setInterval(function() { game.village.huntAll(); }, this.huntMillis);
				} else {
					clearInterval(this.huntInterval);
					this.huntInterval = null;
				}
			},
			huntMillis: 2000,
			huntInterval: null
		},
		praiseSun: {
			praise: function() {
				if (game.science.get("theology").researched !== true) {
					return;
				}
				if (this.praiseSun === true) {
					gamePage.religion.praise();
				}
			},
			praiseSun: false
		},
		speed: {
			paused: false,
			toggle: function () {
				if (this.paused === true) {
					console.log("starting game");
					gamePage.start();
					this.paused = false;
					$('#gamespeedplaystop').prop('value', "STOP");
				} else {
					console.log("pausing game");
					gamePage.worker.terminate();
					gamePage.worker = undefined;
					this.paused = true;
					$('#gamespeedplaystop').prop('value', "PLAY");
				}
			},
			setRate: function (r) {
				if (r < 1) {
					r = 1;
				}
				gamePage.rate = r;
				$('#gamespeedcurrentrate').html(gamePage.rate);
				if (gamePage.worker !== undefined) {
					gamePage.worker.terminate();
					gamePage.start();
				}
			},
			reset: function() {
				this.setRate(5);
			},
			change: function(r) {
				rate = gamePage.rate + r;
				if (gamePage.rate < 1) { gamePage.rate = 1; }
				this.setRate(rate);
			},
			single_step: false,
			step_single_frame: function() {
				this.single_step = true;
				gamePage.tick();
				this.single_step = false;
			}
		},
		build: {
			is_limited: function(building) { // check if max resources limit was hit, so no more buildings can be build
				a = building.needed;
				for (x in a) {
					needed = a[x].val;
					resMax = gamePage.resPool.get(a[x].name).maxValue;
					if (resMax === 0) {
						continue;
					}
					if (needed > resMax) {
						return true;
					}
				}
				return false;
			},
			// this checks if building can be built. it also adds resources required to dict 'reserved_res'
			resource_has: function(name) { return gamePage.resPool.get(name).value; },
			resource_per_tick: function(name) {
				var prod = gamePage.resPool.get(name).perTickUI;
				if (prod === undefined || prod == 0) {
					prod = this.crafts_data.by_name[name].produced_value;
				}
				return (prod === undefined) ? 0 : prod;
			},
			resource_get_max_time: function(res_needed) {
				var max_time = 0;
				for (var x in res_needed) {
					var res = res_needed[x];
					var needed = res.val;
					var res_has = this.resource_has(res.name);
					var res_time = Math.ceil((needed - res_has) / this.resource_per_tick(res.name));
					max_time = Math.max(res_time, max_time);
				}
				return max_time;
			},
			can_be_built: function(name, glob_res, local_res) {
				var rv = true; // by default assume that building can be built
				var a = this.buildings[name].needed;
				var res_time = this.resource_get_max_time(a);
				if (res_time == Infinity) {
					return false; // resource won't be ever built, since production is most probably 0
				}
				for (x in a) {
					var needed = a[x].val; // amount of resources needed for construction
					var res = this.resource_has(a[x].name); // amount of resource available
					var prod = this.resource_per_tick(a[x].name); // amount of resource gained per tick
					// now check how much time is needed to produce required amount of resource
					var time_needed = Math.ceil((needed - res) / prod);
					// now, if time is less then res_time, which is max time, we should reserve (res_time - time_needed) * prod less
					// resource than we originally thought
					if (time_needed < res_time) {
						var tmp = (res_time - time_needed) * prod;
						if (isNaN(tmp)) {
							tmp = 0;
						}
						needed -= tmp;
						if (needed < 0) { needed = 0; }
					}
					if (local_res[a[x].name] === undefined || local_res[a[x].name] < needed) {
						local_res[a[x].name] = needed;
					}
					if (glob_res[a[x].name] !== undefined) {
						// return false only if after buying this structure (res - needed < glob_res[a[x].name])
						// we'll be left with less resources than required for higher priority structure
						if (res - needed < glob_res[a[x].name]) {
							rv = false;
						}
					} else {
						if (res < needed) {
							rv = false;
						}
					}
				}
				return rv;
			},
			buildings: {},
			render_pending: false,
			rescan: function() {
				var bd = gamePage.bld.buildingsData;
				for (x in bd) {
					var nm = bd[x].name;
					if (bd[x].unlocked) { // if building is unlocked and not on the buildings list, put it there
						if (this.buildings[nm] === undefined) {
							this.buildings[nm] = {
								name: nm,
								label: ((bd[x].upgradable === true )? bd[x].stages[bd[x].stage || 0].label : bd[x].label),
								group: 0,
								stage: 0,
								// count: gamePage.bld.get(nm).val,
								limited: false,
								needed: gamePage.bld.getPrices(nm) };
								this.render_pending = true;
						} else if (bd[x].upgradable === true && bd[x].stage > this.buildings[nm].stage) {
							this.buildings[nm].label = ((bd[x].upgradable === true )? bd[x].stages[bd[x].stage || 0].label : bd[x].label);
							this.buildings[nm].stage = bd[x].stage;
						}
					} else { // if buildings isn't unlocked but for some reason is on the list, remove
						if (this.buildings[nm] !== undefined) {
							delete this.buildings[nm];
							this.render_pending = true;
						}
					}
				}
			},
			global_reserved_resources: { },
			update_reserved_resources: function(reserve) {
				for (y in reserve) {
					if (this.global_reserved_resources[y] === undefined) {
						this.global_reserved_resources[y] = reserve[y];
					} else {
						this.global_reserved_resources[y] += reserve[y];
					}
				}
			},
			select_candidate: function() {
				this.global_reserved_resources = { };
				// in the beginning, both sets are empty. when single group is scanned, resources required by not capped
				// buildings in this group are added to the local_reserved_resources. when group checking is finished and
				// nothing was selected for build, local_reserved_resources are added to global_reserved_resources and
				// next group is checked. this is repeated for all groups.
				var rv = null;
				for (var x = this.groups.length - 1; x > 0; --x) { // > 0 since group 0 is "no-auto-build"
					var local_reserved_resources = { };
					var g = this.groups[x];
					if (g === undefined || g.list === undefined || g.list.length === 0) {
						continue;
					}
					if (this.is_group_limited(g)) {
						continue;
					}
					// group is not limited (i.e. there is at least one building which is not res-capped)
					for (var y = 0 ; y < g.list.length ; ++y) {
						var i = y;
						if (g.list[i].limited) {
							continue;
						}
						if (this.can_be_built(g.list[i].name, this.global_reserved_resources, local_reserved_resources) !== true) {
							continue;
						}
						if (rv === null) {
							rv = g.list[i];
						}
					}
					this.update_reserved_resources(local_reserved_resources);
				}
				this.render_reserved_resources();
				return rv;
			},
			build: function() {
				this.render();
				if (!this.do_auto_build) { return; }
				if (jda_busy_kittens.speed.single_step !== true && (gamePage.worker === undefined || gamePage.isPaused === true))
				{
					return; // avoid building when game is paused or not working, but not when single stepping, since this leads to anomalies
				}
				if (gamePage.activeTabId !== "Bonfire") { return ; }
				var candidate = this.select_candidate();
				if (candidate === null) {
					return;
				}
				x = $("div.btn:not(.disabled)>div:contains('" + candidate.label + "')");
				if (x.length > 0) {
					x.click();
					this.render_pending = true;
					gamePage.msg('AutoBuild: ' + candidate.label, "notice", "autobuild");
				}
			},
			groups: [],
			rebuild_groups: function() {
				this.rescan();
				this.groups = [];
				for (var x in this.buildings) {
					var g = this.buildings[x].group;
					this.buildings[x].needed = gamePage.bld.getPrices(x);
					// this.buildings[x].count = gamePage.bld.get(x).val;
					var new_limited = this.is_limited(this.buildings[x]);
					if (new_limited != this.buildings[x].limited) {
						this.buildings[x].limited = new_limited;
						if (new_limited === true) {
							$("#jdabld" + this.buildings[x].name + "span").addClass("limited");
						} else {
							$("#jdabld" + this.buildings[x].name + "span").removeClass("limited");
						}
					}
					if (this.groups[g] === undefined) {
						this.groups[g] = { list: [], reserved_resources: {} };
					}
					this.groups[g].list.push(this.buildings[x]);
					var res = this.buildings[x].needed;
					for (var r in res) {
						if (this.groups[g].reserved_resources[r.name] === undefined) {
							this.groups[g].reserved_resources[r.name] = r.val;
						} else {
							if (this.groups[g].reserved_resources[r.name] < r.val) {
								this.groups[g].reserved_resources[r.name] = r.val;
							}
						}
					}
				}
			},
			render: function() {
				this.rebuild_groups();
				if (this.render_pending !== true) {
					return;
				}
				this.render_pending = false;
				var s = "";
				var i = this.groups.length;
				s += "<div><ul>";
				for (var x = i - 1; x >= 0 ; x--) {
					if (this.groups[x] === undefined || this.groups[x].length === 0) {
						continue;
					}
					s += "<li><ul> GROUP " + x + "&nbsp;" + this.render_group_up_down_buttons(x);

					for (b in this.groups[x].list) {
						var bb = this.groups[x].list[b];
						s += "<li><div style='inline-block;'> "+ this.render_building_group_up_down_buttons(bb.name) + "<span id='jdabld" +
						bb.name + "span' class='" + (bb.limited ? 'limited' : '') + "'>" +
						bb.label + "</span></div></li>";
					}
					s += "</ul></li>";
				}
				s += "</ul></div>";
				$("#jda_busy_kittens_build").empty().append(s);
			},
			render_reserved_resources: function() {
				// first, reset reserved resources
				for (var x in this.crafts_data.list) {
					this.crafts_data.list[x].reserved.innerHTML = "0";
				}
				// now, update reserved resources
				for (b in this.global_reserved_resources) {
					this.crafts_data.by_name[b].reserved.innerHTML = this.global_reserved_resources[b].toFixed(0);
				}
			},
			group_up: function(y) {
				if (y === NaN) { return; }
				if (this.groups[y] === undefined) { return; }
				// ok, there is such group, check if group y + 1 exists. if yes, swap them,
				// otherwise simply renumber group to y + 1
				var l = this.groups[y].list;
				for (var b in l) {
					l[b].group = y + 1;
				}
				if (this.groups[y + 1] !== undefined) {
					l = this.groups[y + 1].list;
					for (b in this.groups[y + 1].list) {
						l[b].group = y;
					}
				}
				this.render_pending = true;
				this.render();
				jda_busy_kittens.save.save();
			},
			group_down: function(y) {
				if (y === NaN) { return; }
				if (this.groups[y] === undefined) { return; }
				if (y <= 1) { return; } // can't move anything to/from group 0 automatically
				var l = this.groups[y].list;
				for (var b in l) {
					l[b].group = y - 1;
				}
				if (this.groups[y - 1] !== undefined) {
					l = this.groups[y - 1].list;
					for (b in this.groups[y - 1].list) {
						l[b].group = y;
					}
				}
				this.render_pending = true;
				this.render();
				jda_busy_kittens.save.save();
			},
			building_group_up: function(n) {
				if (this.buildings[n] === undefined) {
					return ;
				}
				this.buildings[n].group += 1;
				jda_busy_kittens.save.save();
				this.render_pending = true;
				this.render();
			},
			building_group_down: function(n) {
				if (this.buildings[n] === undefined) {
					return;
				}
				if (this.buildings[n].group > 0) {
					this.buildings[n].group -= 1;
				}
				jda_busy_kittens.save.save();
				this.render_pending = true;
				this.render();
			},
			is_group_limited: function(group) {
				for (x in group.list) {
					if (group.list[x].limited !== true) {
						return false;
					}
				}
				return true;
			},
			render_group_up_down_buttons: function(number) {
				var s = "";
				s += "<a class='jdalnk' href='#' onclick='jda_busy_kittens.build.group_up(" + number + ");'>+</a>&nbsp;";
				s += "<a class='jdalnk' href='#' onclick='jda_busy_kittens.build.group_down(" + number + ");'>-</a>&nbsp;";
				return s;
			},
			render_building_group_up_down_buttons: function (name) {
				var s = "";
				s += "<a class='jdalnk' href='#' onclick='jda_busy_kittens.build.building_group_up(\"" + name + "\");'>+</a>&nbsp;";
				s += "<a class='jdalnk' href='#' onclick='jda_busy_kittens.build.building_group_down(\"" + name + "\");'>-</a>&nbsp;";
				return s;
			},
			craft: function(name) {
				if (this.do_auto_craft === false) {
					return;
				}
				// if do_auto_build is false, structure construction is not requested. so reset global_reserved_resources to 0, so anything can be crafted.
				if (this.do_auto_build === false) {
					this.global_reserved_resources = { };
				}
				// this function scans available crafts and compares them with global_reserved_resources. Since global_reserved_resources
				// keeps maximum of resource required for all buildings (i.e. if we have: library 100 wood, workshop 400 minerals and 150 wood,
				// and smelter 500 minerals, values stored are wood 150 and minerals 500), we can craft everything over these limits. This will
				// do funny things for wood, since wood can be near maximum and making more from catnip will make more than we can store, but I'm
				// not willing to fix it ATM.
				// 'ere we go. first for each resource check how much we can 'sacrifice'
				var available = { };
				var r = gamePage.resPool.resources;
				for (var x in r) {
					var have = r[x].value - this.crafts_data.get_limit(r[x].name);
					var need = this.global_reserved_resources[r[x].name];
					need = (need === undefined ? 0 : need);
					if (have > 0 && have > need) {
						available[r[x].name] = have - need;
					}
				}
				var crafts = gamePage.workshop.crafts;
				for (var c in crafts) {
					this.crafts_data.by_name[crafts[c].name].produced_value = 0;
					this.crafts_data.by_name[crafts[c].name].produced.innerHTML = 0;
					if (!crafts[c].unlocked) {
						continue;
					}
					if (!this.crafts_data.by_name[crafts[c].name].allowed) {
						continue;
					}
					var toCraft = Infinity;
					var prices = crafts[c].prices;
					for (r in prices) {
						var p = available[prices[r].name];
						if (p !== undefined && p !== NaN && p > prices[r].val) {
							var tmp = Math.floor(p / prices[r].val);
							toCraft = (tmp < toCraft) ? tmp : toCraft;
						} else {
							toCraft = 0;
							break; // nothing to do here
						}
					}
					if (toCraft !== Infinity && toCraft > 0 && toCraft !== undefined) {
						var pre = gamePage.resPool.get(crafts[c].name).value;
						gamePage.craft(crafts[c].name, toCraft);
						var post = gamePage.resPool.get(crafts[c].name).value;
						var diff = post - pre;
						//var prod_str = "pre: " + pre + "<br>post: " + post + "<br>diff: " + diff + "<br>req: " + toCraft;
						this.crafts_data.by_name[crafts[c].name].produced_value = diff;
						this.crafts_data.by_name[crafts[c].name].produced.innerHTML = diff.toFixed(0);
						for (r in prices) {
							available[prices[r].name] -= toCraft * prices[r].val;
						}
					}
				}
			},
			crafts_data: {
				by_name: {},
				list: [],
				get_limit: function(name) {
					if (this.by_name[name] === undefined || this.by_name[name].limit === undefined || isNaN(this.by_name[name].limit)) {
						return 0;
					}
					return this.by_name[name].limit;
				}
			},
			craft_table_visible: true,
			toggle_craft_table: function(elem) {
				if (this.craft_table_visible) {
					$("#jda_busy_kittens_craft_table").css({"display": "none"});
				} else {
					$("#jda_busy_kittens_craft_table").css({"display": ""});
				}
			},
			build_table_visible: true,
			toggle_build_table: function(elem) {
				if (this.build_table_visible) {
					$("#jda_busy_kittens_build").css({"display" : "none"});
				} else {
					$("#jda_busy_kittens_build").css({"display" : ""});
				}
			},
			usedInCraft: function(name) {
				var c = gamePage.workshop.crafts;
				for (x in c) {
					for (d in c[x].prices) {
						if (c[x].prices[d].name == name) {
							return true;
						}
					}
				}
				return false;
			},
			save_crafts: function() {
				var save_game = { };
				for (var x in this.crafts_data.list) {
					var c = this.crafts_data.list[x];
					save_game[c.name] = { allowed: c.allowed, limit: c.limit };
				}
				LCstorage["kittensgame.busyKittensCrafts"] = JSON.stringify(save_game);
			},
			initialize_crafts: function() {
				var saved_game = LCstorage["kittensgame.busyKittensCrafts"] ? JSON.parse(LCstorage["kittensgame.busyKittensCrafts"]) : { };
				var tab = document.createElement("table");
				var crafts = gamePage.resPool.resources;//.crafts;
				var thead = tab.createTHead();
				var row = thead.insertRow(-1);
				row.insertCell(-1).innerHTML = "No.";
				row.insertCell(-1).innerHTML = "USE";
				row.insertCell(-1).innerHTML = "CRAFT";
				row.insertCell(-1).innerHTML = "LIMIT";
				row.insertCell(-1).innerHTML = "RESERVED";
				row.insertCell(-1).innerHTML = "PRODUCED";
				for (var c in crafts) {
					var unlocked = gamePage.workshop.getCraft(crafts[c].name);
					if (unlocked === null) {
						unlocked = true;
					} else {
						unlocked = unlocked.unlocked; // sheesh!
					}
					this.crafts_data.list[c] = {
						name: crafts[c].name,
						prio: c,
						allowed: saved_game[crafts[c].name] !== undefined ? saved_game[crafts[c].name].allowed : false,
						unlocked: unlocked,
						limit: saved_game[crafts[c].name] !== undefined ? saved_game[crafts[c].name].limit : 0,
						checkbox: null,
						input_limit: null,
						produced_value: 0,
						reserved: null,
						produced: null
					};
					this.crafts_data.by_name[crafts[c].name] = this.crafts_data.list[c];
					var cd = this.crafts_data.list[c];
					// create element for this craft
					row = tab.insertRow(-1);
					row.insertCell(-1).innerHTML = c;
					
					if (crafts[c].craftable !== undefined && crafts[c].craftable === true) {
						var avail = document.createElement("input");
						avail.type = "checkbox";
						avail.cd = this.crafts_data.list[c];
						avail.checked = this.crafts_data.list[c].allowed;
						$(avail).on("click", function(num) { return function() {
							jda_busy_kittens.build.crafts_data.list[num].allowed = this.checked;
							jda_busy_kittens.build.save_crafts();
						}}(c));
						$(row.insertCell(-1)).append(avail);
					} else {
						row.style["display"] = (this.usedInCraft(crafts[c].name) ? "" : "none");
						row.insertCell(-1);
					}
					$(row.insertCell(-1)).html(crafts[c].name);
					var input_limit = document.createElement("input");
					cd.input_limit = input_limit;
					input_limit.type = "number";
					input_limit.value = cd.limit;
					input_limit.cd = this.crafts_data.list[c];
					$(row.insertCell(-1)).append(input_limit);
					var name = cd.name;
					$(input_limit).on("focusout", function(num) { return function() {
						jda_busy_kittens.build.crafts_data.list[num].limit = parseInt(this.value, 10);
						if (jda_busy_kittens.build.crafts_data.list[num].limit < 0 || isNaN(jda_busy_kittens.build.crafts_data.list[num].limit)) {
							jda_busy_kittens.build.crafts_data.list[num].limit = 0;
						}
						this.value = jda_busy_kittens.build.crafts_data.list[num].limit;
						jda_busy_kittens.build.save_crafts();
					}}(c));
					var reserved_box = document.createElement("div");
					cd.reserved = reserved_box;
					$(row.insertCell(-1)).append(reserved_box);
					var produced_box = document.createElement("div");
					cd.produced = produced_box;
					$(row.insertCell(-1)).append(produced_box);
				}
				$("#jda_busy_kittens_craft_table").append(tab);
			},
			do_auto_build: false,
			toggle_auto_build: function() {
				if (this.do_auto_build === false) {
					this.render_pending = true;
					this.render();
				} else {
					this.render_pending = true;
					this.render();
				}
			},
			do_auto_craft: false,
			register_tick_handler: function() {
				gamePage.originalTick = gamePage.tick;
				gamePage.tick = function() {
					gamePage.originalTick();
					if (jda_busy_kittens.build.autoObserve === true) {
						$('#observeBtn').click();
					}
					jda_busy_kittens.build.build();
					jda_busy_kittens.build.craft();
					jda_busy_kittens.praiseSun.praise();
					jda_busy_kittens.workshop.findCandidate();
					jda_busy_kittens.science.findCandidate();
				};
			},
			autoObserve: false,
		},
		save: {
			clear: function () {
				LCstorage.removeItem("kittensgame.busyKittens");
			},
			save: function() {
				LCstorage["kittensgame.busyKittens"] = JSON.stringify(jda_busy_kittens.build.buildings);
			},
			copyObject: function(source, target) {
				for (var attrname in source) {
					if (typeof source[attrname] === "object") {
						if (typeof target[attrname] === "undefined") {
							target[attrname] = {};
						}
						this.copyObject(source[attrname], target[attrname]);
					} else {
						target[attrname] = source[attrname];
					}
				}
			},
			load: function() {
				if (LCstorage["kittensgame.busyKittens"]) {
					this.copyObject(JSON.parse(LCstorage["kittensgame.busyKittens"]), jda_busy_kittens.build.buildings);
				}
			}
		},
		misc_opts: {
			show: true
		},
		ui: {
			css_list: {
				main: "http://serwer1314723.home.pl/busy_kittens.css"
			},
			load_single_css: function(filename) {
				var fileref=document.createElement("link");
				fileref.setAttribute("rel", "stylesheet");
				fileref.setAttribute("type", "text/css");
				fileref.setAttribute("href", filename + "?" + (Math.random() * Number.MAX_SAFE_INTEGER));
				document.getElementsByTagName("head")[0].appendChild(fileref);
			},
			load_csses: function() {
				for (var x in this.css_list) {
					this.load_single_css(this.css_list[x]);
				}
			},
			build: function() {
				$('#footerLinks').append(' | <a href="#" onclick="$(\'#autoDiv\').toggle();">BusyKittens</a>');
				$('#importDiv').after('<div id="autoDiv" class="jda_help" style="display:none;">' +
					'<div id="autoDivPane" style="width: 600px;overflow-x: hidden;">' +
						'<div id="autoDivCont" ></div><br>' +
					'</div>' + 
				'</div>');
				$('#autoDivCont').append(this.make_speed_control());
				var btn5 = this.make_toggle_button("[ Hide miscellanious options ]", "[ Show miscellanious options ]", window.jda_busy_kittens.misc_opts, "show");
				$('#autoDivCont').append(btn5);
				$('#autoDivCont').append('<div id="autoMiscDiv" style="margin: 3px;">');
				$(btn5).on("click", function() { if (jda_busy_kittens.misc_opts.show === true) { $('#amdCont').css({ "display": "none" }); } else { $('#amdCont').css({"display": ""}); }});
				$('#autoMiscDiv').append('<div style="width: 480px;border-style: solid; border-width: 1px; border-radius: 3px; margin: 3px;" id="amdCont">');
				$('#amdCont').append(this.make_toggle_button("Auto-praise is OFF", "Auto-praise is ON", window.jda_busy_kittens.praiseSun, "praiseSun"));
				$('#amdCont').append(this.make_toggle_button("Auto-science is OFF", "Auto-science is ON", window.jda_busy_kittens.science, "auto"));
				$('#amdCont').append(this.make_toggle_button("Auto-Workshop is OFF", "Auto-workshop is ON", window.jda_busy_kittens.workshop, "auto"));
				var btn6 = this.make_toggle_button("Auto-Hunt is OFF", "Auto-hunt is ON", window.jda_busy_kittens.hunt, "auto");
				$(btn6).on("click", function() { jda_busy_kittens.hunt.toggle(); });
				$('#amdCont').append(btn6);
				$('#amdCont').append('<div style="text-indent: 25px;">Send hunters every <input id="bkahmillis" style="display: inline;" type="number" value="2000" href="#"> milliseconds.<br>');
				$('#amdCont').on("focusout", function() {
					jda_busy_kittens.hunt.huntMillis = parseInt(this.value, 10);
					jda_busy_kittens.hunt.toggle();
					jda_busy_kittens.hunt.toggle();
				});
				$('#bkahbutton').on("click", function() { jda_busy_kittens.hunt.toggle(); });
				$('#amdCont').append(this.make_toggle_button("Auto-observe is OFF", "Auto-observe is ON", window.jda_busy_kittens.build, "autoObserve"));
				var mydiv = document.createElement("div");
				$('#autoDivCont').append(mydiv);
				var btn3 = this.make_toggle_button("Auto-craft is OFF", "Auto-craft is ON", window.jda_busy_kittens.build, "do_auto_craft");
				$(btn3).css("box-sizing", "border-box").css("float", "left");
				$(mydiv).append(btn3);
				
				var btn2 = this.make_toggle_button("[ Hide craft table ]", "[ Show craft table ]", window.jda_busy_kittens.build, "craft_table_visible");
				$(mydiv).append(btn2);
				$(btn2).on("click", function() { jda_busy_kittens.build.toggle_craft_table(this); });
				$(btn2).css("box-sizing", "border-box").css("float", "left");
				$(mydiv).append('<div style="clear: both">');
				$('#autoDivCont').append('<div id="jda_busy_kittens_craft_table"/>');
				
				var mydiv2 = document.createElement("div");
				$('#autoDivCont').append(mydiv2);
				var btn = this.make_toggle_button("Auto-build is OFF", "Auto-build is ON", window.jda_busy_kittens.build, "do_auto_build");
				$(btn).css("box-sizing", "border-box").css("float", "left");
				$(mydiv2).append(btn);
				$(btn).on("click", function() { jda_busy_kittens.build.toggle_auto_build(); });
				var btn4 = this.make_toggle_button("[ Hide build table ]", "[ Show build table ]", window.jda_busy_kittens.build, "build_table_visible");
				$(btn4).css("box-sizing", "border-box").css("float", "left");
				$(mydiv2).append(btn4);
				$(btn4).on("click", function() { jda_busy_kittens.build.toggle_build_table(this); });
				$(mydiv2).append('<div style="clear: both">');
				$('#autoDivCont').append('<div id="jda_busy_kittens_build" />');
				
				this.load_csses();
			},
			make_speed_control: function() {
				return '<div style="border-style: solid; border-width: 1px; border-radius: 3px; margin: 3px;padding:5px;display:inline-block;">' + 
					'<input type="button" value="+10" href="#" onclick="jda_busy_kittens.speed.change(10);">' + 
					'<input type="button" value="+5" href="#" onclick="jda_busy_kittens.speed.change(5);">' + 
					'<input type="button" value="+1" href="#" onclick="jda_busy_kittens.speed.change(1);">' + 
					'<input  type="button" id="gamespeedplaystop" href="#" value="STOP" onclick="jda_busy_kittens.speed.toggle();">' +
					'<input type="button" value="STEP" href="#" onclick="jda_busy_kittens.speed.step_single_frame();">' +
					'<span>SPEED: <span id="gamespeedcurrentrate">5</span>&nbsp;</span>' +
					'<input  type="button" href="#" value="-1" onclick="jda_busy_kittens.speed.change(-1);">' +
					'<input  type="button" href="#" value="-5" onclick="jda_busy_kittens.speed.change(-5);">' +
					'<input  type="button" href="#" value="-10" onclick="jda_busy_kittens.speed.change(-10);">' +
					'&nbsp;&nbsp;&nbsp;<input type="button" href="#" value="RESET" onclick="jda_busy_kittens.speed.reset();"></div>';
			},
			make_toggle_button: function(name_on, name_off, target, target_var) {
				var butt = document.createElement("div");
				butt.style = "border-style: solid; border-width: 1px; border-radius: 3px; margin: 6px; width: 250px; text-align: center;";
				butt.innerHTML = name_on;
				$(butt).on("click", function() {
					if (target[target_var] === false) {
						this.innerHTML = name_off;
						target[target_var] = true;
					} else {
						this.innerHTML = name_on;
						target[target_var] = false;
					}
				});
				return butt;
			}
		}
	};
	jda_busy_kittens.ui.build();
	jda_busy_kittens.save.load();
	jda_busy_kittens.build.register_tick_handler();
	jda_busy_kittens.build.initialize_crafts();
	jda_busy_kittens.huntAllOriginal = gamePage.village.huntAll;
	gamePage.village.huntAll = function() {
		jda_busy_kittens.huntAllOriginal.call(gamePage.village);
	}
	game.console.static.filters["autobuild"] = { title: "Auto-Build", enabled: true, unlocked: true };
	game.console.static.filters["autoscience"] = { title: "Auto-Science", enabled: true, unlocked: true };
	game.console.static.filters["autoworkshop"] = { title: "Auto-Workshop", enabled: true, unlocked: true };
	game.console.static.renderFilters();
}

if (window.jda_busy_kittens === undefined) {
	jda_busy_kittens_initialise();
}
