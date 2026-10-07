//! demoparser2 for the browser. The functions mirror the Node bindings (`@laihoe/demoparser2`) with the same parser
//! settings and output shapes, except that the demo is copied into wasm memory once (`DemoFile`) instead of being
//! passed to every call, and parsing is single-threaded.

use parser::first_pass::parser_settings::{rm_user_friendly_names, FirstPassParser, ParserInputs};
use parser::parse_demo::{DemoOutput, Parser, ParsingMode};
use parser::second_pass::parser_settings::create_huffman_lookup_table;
use parser::second_pass::variants::{soa_to_aos, OutputSerdeHelperStruct};
use ahash::AHashMap;
use serde::Serialize;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct DemoFile {
    bytes: Vec<u8>,
}

/// Results are returned as JSON text: one JSON.parse is much faster than building millions of JS values through
/// the wasm boundary, and gives the same shapes as the Node bindings (which use serde_json too).
fn to_js<T: Serialize + ?Sized>(value: &T) -> Result<String, JsError> {
    serde_json::to_string(value).map_err(|e| JsError::new(&e.to_string()))
}

fn real_names(props: &Vec<String>) -> Result<Vec<String>, JsError> {
    rm_user_friendly_names(props).map_err(|e| JsError::new(&e.to_string()))
}

fn name_map(real: &[String], friendly: &[String]) -> AHashMap<String, String> {
    real.iter().cloned().zip(friendly.iter().cloned()).collect()
}

fn inputs(huf: &Vec<(u8, u8)>) -> ParserInputs<'_> {
    ParserInputs {
        real_name_to_og_name: AHashMap::default(),
        wanted_players: vec![],
        wanted_player_props: vec![],
        wanted_other_props: vec![],
        wanted_prop_states: AHashMap::default(),
        wanted_events: vec![],
        parse_ents: true,
        wanted_ticks: vec![],
        parse_projectiles: false,
        only_header: false,
        list_props: false,
        only_convars: false,
        huffman_lookup_table: huf,
        order_by_steamid: false,
        fallback_bytes: None,
        parse_grenades: false,
    }
}

#[wasm_bindgen]
impl DemoFile {
    /// Allocates the buffer up front so a large demo can be streamed in with `append` without reallocations.
    #[wasm_bindgen(constructor)]
    pub fn new(size: usize) -> DemoFile {
        DemoFile { bytes: Vec::with_capacity(size) }
    }

    pub fn append(&mut self, chunk: &[u8]) {
        self.bytes.extend_from_slice(chunk);
    }

    fn parse(&self, settings: ParserInputs) -> Result<DemoOutput, JsError> {
        Parser::new(settings, ParsingMode::ForceSingleThreaded)
            .parse_demo(&self.bytes)
            .map_err(|e| JsError::new(&e.to_string()))
    }

    #[wasm_bindgen(js_name = parseHeader)]
    pub fn parse_header(&self) -> Result<String, JsError> {
        let huf = create_huffman_lookup_table();
        let mut settings = inputs(&huf);
        settings.parse_ents = false;
        settings.only_header = true;
        let header = FirstPassParser::new(&settings)
            .parse_header_only(&self.bytes)
            .map_err(|e| JsError::new(&e.to_string()))?;
        let hm: HashMap<String, String> = header.into_iter().collect();
        to_js(&hm)
    }

    #[wasm_bindgen(js_name = parseEvents)]
    pub fn parse_events(
        &self,
        event_names: Vec<String>,
        player_props: Vec<String>,
        other_props: Vec<String>,
    ) -> Result<String, JsError> {
        let real_player = real_names(&player_props)?;
        let real_other = real_names(&other_props)?;
        let mut names = name_map(&real_player, &player_props);
        names.extend(name_map(&real_other, &other_props));

        let huf = create_huffman_lookup_table();
        let mut settings = inputs(&huf);
        settings.real_name_to_og_name = names;
        settings.wanted_player_props = real_player;
        settings.wanted_other_props = real_other;
        settings.wanted_events = event_names;
        settings.only_header = true;
        to_js(&self.parse(settings)?.game_events)
    }

    #[wasm_bindgen(js_name = parseTicks)]
    pub fn parse_ticks(
        &self,
        props: Vec<String>,
        ticks: Vec<i32>,
        struct_of_arrays: bool,
    ) -> Result<String, JsError> {
        let real = real_names(&props)?;
        let huf = create_huffman_lookup_table();
        let mut settings = inputs(&huf);
        settings.real_name_to_og_name = name_map(&real, &props);
        settings.wanted_player_props = real;
        settings.wanted_ticks = ticks;
        let output = self.parse(settings)?;

        let mut prop_infos = output.prop_controller.prop_infos.clone();
        prop_infos.sort_by_key(|x| x.prop_name.clone());
        let helper = OutputSerdeHelperStruct { prop_infos, inner: output.df.into() };
        if struct_of_arrays {
            to_js(&helper)
        } else {
            to_js(&soa_to_aos(helper))
        }
    }

    #[wasm_bindgen(js_name = parseGrenades)]
    pub fn parse_grenades(&self, extra: Vec<String>, grenades: bool) -> Result<String, JsError> {
        let real = real_names(&extra)?;
        let huf = create_huffman_lookup_table();
        let mut settings = inputs(&huf);
        settings.wanted_other_props = real;
        settings.parse_projectiles = true;
        settings.only_header = true;
        settings.parse_grenades = grenades;
        let output = self.parse(settings)?;

        let mut prop_infos = output.prop_controller.prop_infos.clone();
        prop_infos.sort_by_key(|x| x.prop_name.clone());
        let helper = OutputSerdeHelperStruct { prop_infos, inner: output.df.into() };
        to_js(&soa_to_aos(helper))
    }
}
